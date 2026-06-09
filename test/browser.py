#!/usr/bin/env python3
import time
import re
from playwright.sync_api import sync_playwright, expect

# Global configuration variables
APP_URL = "http://localhost:8080"
CDP_URL = "http://localhost:9876"

# TODO Fill in tests


if __name__ == "__main__":
    run_regression_suite()
