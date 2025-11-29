#!/usr/bin/env python3
"""
SparkQueue - Distributed Task/Job Queue Management System

Main entry point for the SparkQueue application.
"""

import os
import sys
import yaml
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def load_config():
    """Load configuration from config.yaml"""
    config_path = Path(__file__).parent / "config.yaml"
    if not config_path.exists():
        logger.warning(f"Config file not found: {config_path}")
        return {}

    with open(config_path, 'r') as f:
        config = yaml.safe_load(f) or {}
    return config


def main():
    """Main entry point for SparkQueue"""
    logger.info("Starting SparkQueue...")

    try:
        config = load_config()
        app_name = config.get("app", {}).get("name", "sparkqueue")
        app_version = config.get("app", {}).get("version", "0.1.0")

        logger.info(f"SparkQueue v{app_version} initialized")
        logger.info(f"Configuration loaded from config.yaml")

        # Display startup info
        print("\n" + "=" * 60)
        print(f"🚀 {app_name} v{app_version}")
        print("=" * 60)
        print(f"Log level: {logging.getLogger().level}")
        print(f"Config: {config.get('app', {}).get('description', 'No description')}")
        print("=" * 60 + "\n")

        # Run event loop (placeholder)
        logger.info("SparkQueue is running. Press Ctrl+C to stop.")
        while True:
            import time
            time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Shutting down SparkQueue...")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
