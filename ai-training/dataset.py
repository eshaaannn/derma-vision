import csv
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from PIL import Image
from torch.utils.data import Dataset


def resolve_image_path(raw_path, csv_path):
    cleaned_path = str(raw_path or "").strip()
    if not cleaned_path:
        raise ValueError("CSV row is missing image_path")
    candidate = Path(cleaned_path)

    csv_dir = csv_path.parent
    search_paths = []
    if candidate.is_absolute():
        search_paths.append(candidate)
        search_paths.append(csv_dir / "images" / candidate.name)
    else:
        search_paths.append(csv_dir / candidate)
        search_paths.append(csv_dir / "images" / candidate.name)

    for search_path in search_paths:
        if search_path.exists():
            return search_path.resolve()

    raise FileNotFoundError(f"Unable to resolve image path '{raw_path}' from {csv_path}")


@dataclass(frozen=True)
class DatasetSummary:
    csv_path: Path
    total_rows: int
    valid_samples: int
    class_counts: dict[str, int]
    unused_image_count: int


def summarize_dataset(csv_path, image_column="image_path", label_column="label"):
    csv_path = Path(csv_path).resolve()
    if not csv_path.exists():
        raise FileNotFoundError(f"Dataset CSV not found: {csv_path}")

    class_counts = Counter()
    referenced_image_names = set()
    total_rows = 0
    valid_samples = 0

    with csv_path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        missing_columns = {image_column, label_column} - set(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Dataset CSV is missing required columns: {sorted(missing_columns)}")

        for row in reader:
            total_rows += 1
            label = str(row.get(label_column, "")).strip()
            image_path = resolve_image_path(row.get(image_column, ""), csv_path)
            referenced_image_names.add(image_path.name)
            if not label:
                continue
            valid_samples += 1
            class_counts[label] += 1

    images_dir = csv_path.parent / "images"
    unused_image_count = 0
    if images_dir.exists():
        image_files = {path.name for path in images_dir.iterdir() if path.is_file()}
        unused_image_count = len(image_files - referenced_image_names)

    return DatasetSummary(
        csv_path=csv_path,
        total_rows=total_rows,
        valid_samples=valid_samples,
        class_counts=dict(sorted(class_counts.items())),
        unused_image_count=unused_image_count,
    )


class SkinLesionCSVDataset(Dataset):
    def __init__(self, csv_path, transform=None, image_column="image_path", label_column="label"):
        self.csv_path = Path(csv_path).resolve()
        self.transform = transform
        self.image_column = image_column
        self.label_column = label_column
        self.samples = []
        self.class_names = []
        self.class_to_idx = {}
        self.queries = []

        if not self.csv_path.exists():
            raise FileNotFoundError(f"Dataset CSV not found: {self.csv_path}")

        with self.csv_path.open(newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            missing_columns = {image_column, label_column} - set(reader.fieldnames or [])
            if missing_columns:
                raise ValueError(f"Dataset CSV is missing required columns: {sorted(missing_columns)}")

            rows = list(reader)

        labels = sorted({str(row.get(label_column, "")).strip() for row in rows if str(row.get(label_column, "")).strip()})
        if not labels:
            raise RuntimeError(f"No valid labels found in {self.csv_path}")

        self.class_names = labels
        self.class_to_idx = {label: idx for idx, label in enumerate(self.class_names)}

        for row in rows:
            label = str(row.get(label_column, "")).strip()
            if not label:
                continue

            image_path = resolve_image_path(row.get(image_column, ""), self.csv_path)
            self.samples.append((str(image_path), self.class_to_idx[label]))
            self.queries.append(str(row.get("query", "")).strip())

        if not self.samples:
            raise RuntimeError(f"No valid samples found in {self.csv_path}")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        image = Image.open(path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        return image, label
