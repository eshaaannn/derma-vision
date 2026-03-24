import argparse
from collections import Counter
from copy import deepcopy
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
import torchvision.transforms as transforms
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Subset, WeightedRandomSampler
from torchvision import models
from tqdm import tqdm

from dataset import SkinLesionCSVDataset, summarize_dataset


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV_PATH = BASE_DIR / "data" / "dataset.csv"
DEFAULT_MODEL_PATH = BASE_DIR / "model.pt"
DEFAULT_LABEL_RISK = {
    "Suspicious_lesion": 0.92,
    "Bacterial_infection": 0.58,
    "Parasitic_infestation": 0.52,
    "Viral_skin_disease": 0.48,
    "Fungal_infection": 0.42,
    "Inflammatory_rash": 0.34,
    "Low_risk": 0.08,
    "Benign_lesion": 0.14,
}


class FocalLoss(nn.Module):
    def __init__(self, weight=None, gamma=0.0):
        super().__init__()
        self.weight = weight
        self.gamma = gamma

    def forward(self, logits, targets):
        log_probs = F.log_softmax(logits, dim=1)
        probs = log_probs.exp()
        target_log_probs = log_probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        target_probs = probs.gather(1, targets.unsqueeze(1)).squeeze(1)

        if self.weight is not None:
            sample_weight = self.weight.gather(0, targets)
        else:
            sample_weight = torch.ones_like(target_probs)

        focal_factor = (1.0 - target_probs).pow(self.gamma)
        loss = -sample_weight * focal_factor * target_log_probs
        return loss.mean()


def parse_args():
    parser = argparse.ArgumentParser(description="Train the Derma Vision image classifier from dataset.csv.")
    parser.add_argument("--csv-path", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--model-path", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--backbone-learning-rate", type=float, default=2e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--val-size", type=float, default=0.2)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--trainable-feature-blocks", type=int, default=3)
    parser.add_argument("--focus-label", type=str, default="Suspicious_lesion")
    parser.add_argument("--focus-loss-boost", type=float, default=1.75)
    parser.add_argument("--focus-sampler-boost", type=float, default=2.0)
    parser.add_argument("--focal-gamma", type=float, default=1.5)
    parser.add_argument("--disable-weighted-sampler", action="store_true")
    return parser.parse_args()


def set_seed(seed):
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def build_transforms(image_size):
    normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    train_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.15),
            transforms.ToTensor(),
            normalize,
        ]
    )
    eval_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            normalize,
        ]
    )
    return train_transform, eval_transform


def build_model(num_classes, trainable_feature_blocks):
    pretrained_loaded = False
    try:
        weights = models.EfficientNet_B0_Weights.DEFAULT
        model = models.efficientnet_b0(weights=weights)
        pretrained_loaded = True
    except Exception as exc:
        print(f"Pretrained EfficientNet weights unavailable, falling back to random init: {exc}")
        model = models.efficientnet_b0(weights=None)

    model.classifier[1] = nn.Linear(1280, num_classes)

    if pretrained_loaded:
        for param in model.features.parameters():
            param.requires_grad = False

        trainable_feature_blocks = max(0, min(trainable_feature_blocks, len(model.features)))
        for block in model.features[-trainable_feature_blocks:]:
            for param in block.parameters():
                param.requires_grad = True

    return model, pretrained_loaded


def compute_class_weights(label_indices, class_names, device, focus_label, focus_loss_boost):
    counts = Counter(label_indices)
    num_classes = len(class_names)
    total = len(label_indices)
    weights = [total / (num_classes * max(counts.get(class_idx, 0), 1)) for class_idx in range(num_classes)]

    if focus_label in class_names:
        focus_index = class_names.index(focus_label)
        weights[focus_index] *= focus_loss_boost

    weight_tensor = torch.tensor(weights, dtype=torch.float32, device=device)
    weight_tensor = weight_tensor / weight_tensor.mean()
    return weight_tensor


def build_sampler(label_indices, class_names, focus_label, focus_sampler_boost):
    counts = Counter(label_indices)
    class_weights = [1.0 / max(counts.get(class_idx, 0), 1) for class_idx in range(len(class_names))]

    if focus_label in class_names:
        focus_index = class_names.index(focus_label)
        class_weights[focus_index] *= focus_sampler_boost

    sample_weights = [class_weights[label] for label in label_indices]
    return WeightedRandomSampler(
        weights=torch.tensor(sample_weights, dtype=torch.double),
        num_samples=len(label_indices),
        replacement=True,
    )


def build_optimizer(model, learning_rate, backbone_learning_rate, weight_decay):
    classifier_params = [parameter for parameter in model.classifier.parameters() if parameter.requires_grad]
    backbone_params = [
        parameter
        for name, parameter in model.named_parameters()
        if parameter.requires_grad and not name.startswith("classifier.")
    ]

    param_groups = []
    if backbone_params:
        param_groups.append({"params": backbone_params, "lr": backbone_learning_rate})
    if classifier_params:
        param_groups.append({"params": classifier_params, "lr": learning_rate})
    if not param_groups:
        raise RuntimeError("No trainable parameters found.")

    return optim.AdamW(param_groups, weight_decay=weight_decay)


def run_epoch(model, data_loader, criterion, optimizer, device, epoch_index, epochs):
    model.train()
    running_loss = 0.0
    all_predictions = []
    all_targets = []

    for images, labels in tqdm(data_loader, desc=f"Epoch {epoch_index}/{epochs}", leave=False):
        images = images.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += float(loss.item()) * images.size(0)
        predictions = outputs.argmax(dim=1)
        all_predictions.extend(predictions.cpu().tolist())
        all_targets.extend(labels.cpu().tolist())

    epoch_loss = running_loss / max(len(data_loader.dataset), 1)
    epoch_accuracy = accuracy_score(all_targets, all_predictions)
    epoch_macro_f1 = f1_score(all_targets, all_predictions, average="macro", zero_division=0)
    return epoch_loss, epoch_accuracy, epoch_macro_f1


def evaluate(model, data_loader, criterion, device, class_names):
    model.eval()
    running_loss = 0.0
    all_predictions = []
    all_targets = []

    with torch.no_grad():
        for images, labels in data_loader:
            images = images.to(device)
            labels = labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            running_loss += float(loss.item()) * images.size(0)
            predictions = outputs.argmax(dim=1)
            all_predictions.extend(predictions.cpu().tolist())
            all_targets.extend(labels.cpu().tolist())

    loss = running_loss / max(len(data_loader.dataset), 1)
    accuracy = accuracy_score(all_targets, all_predictions)
    macro_f1 = f1_score(all_targets, all_predictions, average="macro", zero_division=0)
    report = classification_report(
        all_targets,
        all_predictions,
        target_names=class_names,
        zero_division=0,
        digits=4,
    )
    report_dict = classification_report(
        all_targets,
        all_predictions,
        target_names=class_names,
        zero_division=0,
        output_dict=True,
    )
    matrix = confusion_matrix(all_targets, all_predictions, labels=list(range(len(class_names)))).tolist()
    return loss, accuracy, macro_f1, report, report_dict, matrix


def build_label_risk_map(class_names):
    label_risk = {}
    for label in class_names:
        label_risk[label] = DEFAULT_LABEL_RISK.get(label, 0.4)
    return label_risk


def serialize_training_args(args):
    serialized = {}
    for key, value in vars(args).items():
        serialized[key] = str(value) if isinstance(value, Path) else value
    return serialized


def extract_focus_metrics(report_dict, focus_label):
    focus_metrics = report_dict.get(focus_label, {})
    return {
        "precision": float(focus_metrics.get("precision", 0.0)),
        "recall": float(focus_metrics.get("recall", 0.0)),
        "f1": float(focus_metrics.get("f1-score", 0.0)),
        "support": int(focus_metrics.get("support", 0)),
    }


def selection_key(focus_metrics, macro_f1, accuracy):
    return (
        round(focus_metrics["f1"], 6),
        round(focus_metrics["recall"], 6),
        round(macro_f1, 6),
        round(accuracy, 6),
    )


def main():
    args = parse_args()
    args.csv_path = args.csv_path.resolve()
    args.model_path = args.model_path.resolve()
    args.model_path.parent.mkdir(parents=True, exist_ok=True)

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    summary = summarize_dataset(args.csv_path)
    print("Dataset analysis")
    print(f"CSV: {summary.csv_path}")
    print(f"Rows in CSV: {summary.total_rows}")
    print(f"Trainable samples: {summary.valid_samples}")
    for label, count in summary.class_counts.items():
        print(f"  {label}: {count}")
    print(f"Unused image files in data/images: {summary.unused_image_count}")

    train_transform, eval_transform = build_transforms(args.image_size)
    train_dataset = SkinLesionCSVDataset(args.csv_path, transform=train_transform)
    val_dataset = SkinLesionCSVDataset(args.csv_path, transform=eval_transform)

    labels = [label for _, label in train_dataset.samples]
    indices = list(range(len(labels)))
    train_indices, val_indices = train_test_split(
        indices,
        test_size=args.val_size,
        random_state=args.seed,
        stratify=labels,
    )

    train_subset = Subset(train_dataset, train_indices)
    val_subset = Subset(val_dataset, val_indices)

    train_labels = [labels[idx] for idx in train_indices]
    sampler = None
    if not args.disable_weighted_sampler:
        sampler = build_sampler(train_labels, train_dataset.class_names, args.focus_label, args.focus_sampler_boost)

    train_loader = DataLoader(
        train_subset,
        batch_size=args.batch_size,
        shuffle=sampler is None,
        sampler=sampler,
        num_workers=args.num_workers,
        pin_memory=device.type == "cuda",
    )
    val_loader = DataLoader(
        val_subset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=device.type == "cuda",
    )

    model, pretrained_loaded = build_model(
        num_classes=len(train_dataset.class_names),
        trainable_feature_blocks=args.trainable_feature_blocks,
    )
    model = model.to(device)

    class_weights = compute_class_weights(
        train_labels,
        train_dataset.class_names,
        device,
        focus_label=args.focus_label,
        focus_loss_boost=args.focus_loss_boost,
    )
    criterion = FocalLoss(weight=class_weights, gamma=args.focal_gamma)
    optimizer = build_optimizer(
        model,
        learning_rate=args.learning_rate,
        backbone_learning_rate=args.backbone_learning_rate,
        weight_decay=args.weight_decay,
    )
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=2)

    best_state = None
    best_score = (-1.0, -1.0, -1.0, -1.0)
    best_report = ""
    best_report_dict = {}
    best_confusion_matrix = []
    best_focus_metrics = {}
    history = []

    print(f"Device: {device}")
    print(f"Using pretrained backbone: {pretrained_loaded}")
    print(f"Training samples: {len(train_subset)}")
    print(f"Validation samples: {len(val_subset)}")
    print(f"Focus label: {args.focus_label}")
    print(f"Trainable feature blocks: {args.trainable_feature_blocks}")
    print(f"Weighted sampler enabled: {not args.disable_weighted_sampler}")

    for epoch in range(1, args.epochs + 1):
        train_loss, train_accuracy, train_macro_f1 = run_epoch(
            model, train_loader, criterion, optimizer, device, epoch, args.epochs
        )
        val_loss, val_accuracy, val_macro_f1, val_report, val_report_dict, val_confusion_matrix = evaluate(
            model, val_loader, criterion, device, train_dataset.class_names
        )

        focus_metrics = extract_focus_metrics(val_report_dict, args.focus_label)
        scheduler.step(focus_metrics["recall"])
        history.append(
            {
                "epoch": epoch,
                "train_loss": round(train_loss, 6),
                "train_accuracy": round(train_accuracy, 6),
                "train_macro_f1": round(train_macro_f1, 6),
                "val_loss": round(val_loss, 6),
                "val_accuracy": round(val_accuracy, 6),
                "val_macro_f1": round(val_macro_f1, 6),
                "focus_precision": round(focus_metrics["precision"], 6),
                "focus_recall": round(focus_metrics["recall"], 6),
                "focus_f1": round(focus_metrics["f1"], 6),
            }
        )

        print(
            f"Epoch {epoch}/{args.epochs} "
            f"train_loss={train_loss:.4f} train_acc={train_accuracy:.4f} train_f1={train_macro_f1:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_accuracy:.4f} val_f1={val_macro_f1:.4f} "
            f"{args.focus_label}_precision={focus_metrics['precision']:.4f} "
            f"{args.focus_label}_recall={focus_metrics['recall']:.4f} "
            f"{args.focus_label}_f1={focus_metrics['f1']:.4f}"
        )

        current_score = selection_key(focus_metrics, val_macro_f1, val_accuracy)
        if current_score > best_score:
            best_score = current_score
            best_state = deepcopy(model.state_dict())
            best_report = val_report
            best_report_dict = val_report_dict
            best_confusion_matrix = val_confusion_matrix
            best_focus_metrics = focus_metrics

    if best_state is None:
        raise RuntimeError("Training did not produce a valid checkpoint.")

    model.load_state_dict(best_state)
    label_risk = build_label_risk_map(train_dataset.class_names)
    checkpoint = {
        "architecture": "efficientnet_b0",
        "num_classes": len(train_dataset.class_names),
        "class_names": train_dataset.class_names,
        "label_risk": label_risk,
        "image_size": args.image_size,
        "normalization": {
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
        },
        "metrics": {
            "selection_focus_label": args.focus_label,
            "best_selection_score": list(best_score),
            "best_focus_metrics": best_focus_metrics,
            "best_val_accuracy": round(float(best_report_dict["accuracy"]), 6),
            "best_val_macro_f1": round(float(best_report_dict["macro avg"]["f1-score"]), 6),
            "classification_report": best_report_dict,
            "confusion_matrix": best_confusion_matrix,
            "history": history,
        },
        "training_args": serialize_training_args(args),
        "state_dict": model.state_dict(),
    }
    torch.save(checkpoint, args.model_path)

    print("Best validation classification report")
    print(best_report)
    print("Best validation confusion matrix")
    print(best_confusion_matrix)
    print(f"Model saved to: {args.model_path}")


if __name__ == "__main__":
    main()
