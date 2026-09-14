import sys
import asyncio
import uuid
from datetime import datetime, timezone
import click
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash


@click.group()
def cli():
    """CLI management tool for Smart Proctoring System."""
    pass


async def _create_admin(name: str, email: str, password: str):
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(User).where(User.email == email.lower()))
        if existing:
            click.echo(f"Error: User with email '{email}' already exists.")
            return

        admin = User(
            id=uuid.uuid4(),
            name=name.strip(),
            email=email.lower().strip(),
            password_hash=get_password_hash(password),
            role="admin",
            created_at=datetime.now(timezone.utc)
        )
        session.add(admin)
        await session.commit()
        click.echo(f"Admin account '{email}' created successfully with ID: {admin.id}")


@cli.command("create-admin")
@click.option("--name", prompt=True, help="Full name of admin user")
@click.option("--email", prompt=True, help="Email address of admin user")
@click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True, help="Password")
def create_admin(name, email, password):
    """Bootstrap an initial administrator account."""
    asyncio.run(_create_admin(name, email, password))


if __name__ == "__main__":
    cli()
