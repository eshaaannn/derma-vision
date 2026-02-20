from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
import torchvision.transforms as transforms
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Subset
from torchvision import models
from tqdm import tqdm

from dataset import PADUFES20Dataset


SEED = 42
torch.manual_seed(SEED)

device = torch.device("cpu")
data_root = Path("data")
pad_ufes_root = data_root / "PAD-UFES-20"

if not pad_ufes_root.exists():
    raise FileNotFoundError(f"Expected dataset not found: {pad_ufes_root}")

transform = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(20),
        transforms.ColorJitter(brightness=0.3, contrast=0.3),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)

dataset = PADUFES20Dataset(str(pad_ufes_root), transform=transform)
labels = [label for _, label in dataset.samples]
num_samples = len(labels)
num_cancer = sum(labels)
num_non_cancer = num_samples - num_cancer

print(f"Dataset: PAD-UFES-20")
print(f"Total samples: {num_samples}")
print(f"Cancer samples: {num_cancer}")
print(f"Non-cancer samples: {num_non_cancer}")

indices = list(range(num_samples))
train_indices, val_indices = train_test_split(
    indices,
    test_size=0.2,
    random_state=SEED,
    stratify=labels,
)

train_dataset = Subset(dataset, train_indices)
val_dataset = Subset(dataset, val_indices)

train_loader = DataLoader(train_dataset, batch_size=8, shuffle=True, num_workers=0)
val_loader = DataLoader(val_dataset, batch_size=8, shuffle=False, num_workers=0)

try:
    weights = models.EfficientNet_B0_Weights.DEFAULT
    model = models.efficientnet_b0(weights=weights)
except AttributeError:
    model = models.efficientnet_b0(pretrained=True)

for param in model.parameters():
    param.requires_grad = False

model.classifier[1] = nn.Linear(1280, 2)
model = model.to(device)

train_labels = [labels[idx] for idx in train_indices]
train_cancer = sum(train_labels)
train_non_cancer = len(train_labels) - train_cancer

weight_non_cancer = len(train_labels) / (2 * max(train_non_cancer, 1))
weight_cancer = len(train_labels) / (2 * max(train_cancer, 1))
class_weights = torch.tensor([weight_non_cancer, weight_cancer], dtype=torch.float32, device=device)

criterion = nn.CrossEntropyLoss(weight=class_weights)
optimizer = optim.Adam(model.classifier[1].parameters(), lr=0.001)
epochs = 5

for epoch in range(epochs):
    model.train()
    running_loss = 0.0

    for images, batch_labels in tqdm(train_loader, desc=f"Epoch {epoch + 1}/{epochs}"):
        images = images.to(device)
        batch_labels = batch_labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, batch_labels)
        loss.backward()
        optimizer.step()

        running_loss += float(loss.item())

    print(f"Epoch {epoch + 1}, Loss: {running_loss:.4f}")

    model.eval()
    preds = []
    true = []
    with torch.no_grad():
        for images, batch_labels in val_loader:
            images = images.to(device)
            batch_labels = batch_labels.to(device)
            outputs = model(images)
            _, predicted = torch.max(outputs, 1)
            preds.extend(predicted.cpu().numpy().tolist())
            true.extend(batch_labels.cpu().numpy().tolist())

    print(classification_report(true, preds, target_names=["Non-Cancer", "Cancer"]))

torch.save(model.state_dict(), "model.pt")
print("Model saved at ai-training/model.pt")
