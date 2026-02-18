import os
from PIL import Image
from torch.utils.data import Dataset

class MEDNODEDataset(Dataset):
    def __init__(self, root_dir, transform=None):
        self.samples = []
        self.transform = transform

        melanoma_dir = os.path.join(root_dir, "melanoma")
        naevus_dir = os.path.join(root_dir, "naevus")

        # 1 = Cancer
        for file in os.listdir(melanoma_dir):
            self.samples.append((os.path.join(melanoma_dir, file), 1))

        # 0 = Non-Cancer
        for file in os.listdir(naevus_dir):
            self.samples.append((os.path.join(naevus_dir, file), 0))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        image = Image.open(path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        return image, label
