import os
import aiofiles
from app.config import settings
from app.storage.base import StorageProvider


class LocalStorageProvider(StorageProvider):
    def __init__(self, upload_dir: str = settings.UPLOAD_DIR):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    async def save_file(self, content: bytes, filename: str) -> str:
        safe_filename = os.path.basename(filename)
        destination_path = os.path.join(self.upload_dir, safe_filename)
        
        # Ensure destination directory exists
        os.makedirs(os.path.dirname(destination_path), exist_ok=True)
        
        async with aiofiles.open(destination_path, "wb") as f:
            await f.write(content)
        return destination_path

    async def get_file(self, storage_path: str) -> bytes:
        if not os.path.exists(storage_path):
            raise FileNotFoundError(f"File not found at {storage_path}")
        async with aiofiles.open(storage_path, "rb") as f:
            return await f.read()

    async def delete_file(self, storage_path: str) -> bool:
        if os.path.exists(storage_path):
            os.remove(storage_path)
            return True
        return False


def get_storage_provider() -> StorageProvider:
    # Factory function for storage provider (easily swap to S3StorageProvider)
    return LocalStorageProvider()
