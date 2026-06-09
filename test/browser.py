#!/usr/bin/env python3
"""
Master regression test runner for EE-Sketcher.

Usage:
    python browser.py                # run all tests
    python browser.py --modes        # run only mode tests
    python browser.py --components   # run only component tests
    python browser.py --help         # show options

Prerequisites:
    ./server.sh must be running on port 8080
    Chrome must be running with --remote-debugging-port=9876
"""

import argparse
import sys
from pathlib import Path

# Ensure the test directory is on sys.path so each test module
# can be imported / run standalone.
TEST_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TEST_DIR))

# Import each test module's run function
from test_modes       import run as run_modes
from test_components  import run as run_components
from test_selection   import run as run_selection
from test_drag        import run as run_drag
from test_connect     import run as run_connect
from test_inspector   import run as run_inspector
from test_deletion    import run as run_deletion
from test_viewport    import run as run_viewport
from test_portal      import run as run_portal
from test_integration import run as run_integration


ALL_SUITES = {
    "modes":       ("Toolbar Modes & Keyboard Shortcuts", run_modes),
    "components":  ("Component Creation", run_components),
    "selection":   ("Selection & Click Handling", run_selection),
    "drag":        ("Drag Mode", run_drag),
    "connect":     ("Connect Mode (Nets)", run_connect),
    "inspector":   ("Inspector Sidebar", run_inspector),
    "deletion":    ("Element Deletion", run_deletion),
    "viewport":    ("Viewport Zoom & Pan", run_viewport),
    "portal":      ("Data Portal Export/Import", run_portal),
    "integration": ("End-to-End Integration", run_integration),
}


def main():
    parser = argparse.ArgumentParser(description="EE-Sketcher Regression Test Runner")
    parser.add_argument("--all", action="store_true", default=False,
                        help="Run all test suites (default if no flags)")
    for key in ALL_SUITES:
        parser.add_argument(f"--{key}", action="store_true", default=False,
                            help=f"Run {ALL_SUITES[key][0]} tests")
    args = parser.parse_args()

    # Determine which suites to run
    any_flag = any(getattr(args, key) for key in ALL_SUITES)
    if args.all or not any_flag:
        selected = list(ALL_SUITES.keys())
    else:
        selected = [key for key in ALL_SUITES if getattr(args, key)]

    passed = 0
    failed = 0
    errors = []

    for key in selected:
        name, fn = ALL_SUITES[key]
        print(f"\n{'='*60}")
        print(f"  Suite: {name}")
        print(f"{'='*60}")
        try:
            fn()
            passed += 1
            print(f"  ✓ PASSED\n")
        except Exception as e:
            failed += 1
            errors.append((name, str(e)))
            print(f"  ✗ FAILED: {e}\n")

    print(f"\n{'='*60}")
    print(f"  Results: {passed} passed, {failed} failed")
    if errors:
        print(f"\n  Failed suites:")
        for name, err in errors:
            print(f"    - {name}: {err}")
    print(f"{'='*60}")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
