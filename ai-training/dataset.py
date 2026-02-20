import csv
from pathlib import Path

from PIL import Image
from torch.utils.data import Dataset


class PADUFES20Dataset(Dataset):
    """
    PAD-UFES-20 binary dataset:
    - label 1 (Cancer): BCC, SCC, MEL
    - label 0 (Non-Cancer): ACK, NEV, SEK and others
    """

    def __init__(self, root_dir, transform=None, malignant_labels=None):
        self.root_dir = Path(root_dir)
        self.transform = transform
        self.malignant_labels = set(malignant_labels or {"BCC", "SCC", "MEL"})
        self.samples = []

        metadata_path = self.root_dir / "metadata.csv"
        images_dir = self.root_dir / "images"

        if not metadata_path.exists():
            raise FileNotFoundError(f"PAD-UFES-20 metadata not found: {metadata_path}")
        if not images_dir.exists():
            raise FileNotFoundError(f"PAD-UFES-20 image folder not found: {images_dir}")

        with metadata_path.open(newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            for row in reader:
                img_id = (row.get("img_id") or "").strip()
                diagnostic = (row.get("diagnostic") or "").strip().upper()
                if not img_id or not diagnostic:
                    continue

                image_path = images_dir / img_id
                if not image_path.exists():
                    continue

                label = 1 if diagnostic in self.malignant_labels else 0
                self.samples.append((str(image_path), label))

        if not self.samples:
            raise RuntimeError("No valid PAD-UFES-20 samples found.")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        image = Image.open(path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        return image, label
