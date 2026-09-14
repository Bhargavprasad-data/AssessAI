from abc import ABC, abstractmethod


class StorageProvider(ABC):
    @abstractmethod
    async def save_file(self, content: bytes, filename: str) -> str:
        """Save file content and return storage path identifier."""
        pass

    @abstractmethod
    async def get_file(self, storage_path: str) -> bytes:
        """Retrieve file content by storage path."""
        pass

    @abstractmethod
    async def delete_file(self, storage_path: str) -> bool:
        """Delete file at storage path."""
        pass
