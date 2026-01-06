#!/bin/bash
#
# EasyOCR Installation Script for Sandbox (Container 203)
#
# This script installs EasyOCR and dependencies on the Proxmox sandbox container.
# Run this INSIDE container 203 as root.
#
# Usage:
#   bash install-easyocr.sh
#

set -e  # Exit on error

echo "========================================="
echo "EasyOCR Installation Script"
echo "Environment: Sandbox (Container 203)"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "ERROR: Please run as root"
   exit 1
fi

# Check if running inside container 203
echo "[1/6] Verifying environment..."
if [ ! -d "/opt/trade-show-app" ]; then
    echo "WARNING: /opt/trade-show-app not found. Are you in container 203?"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update package lists
echo ""
echo "[2/6] Updating package lists..."
apt-get update -qq

# Install system dependencies
echo ""
echo "[3/6] Installing system dependencies..."
echo "  - poppler-utils (PDF processing)"
echo "  - python3, pip (if not installed)"
echo "  - OpenCV dependencies"

apt-get install -y \
    poppler-utils \
    python3 \
    python3-pip \
    python3-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    > /dev/null 2>&1

echo "✓ System dependencies installed"

# Install Python packages
echo ""
echo "[4/6] Installing Python packages..."
echo "  This may take 5-10 minutes on first install..."
echo ""

cd /opt/trade-show-app/backend

pip3 install --quiet --upgrade pip

# Install from requirements.txt
if [ -f "requirements.txt" ]; then
    echo "  Installing from requirements.txt..."
    pip3 install -r requirements.txt
else
    echo "  WARNING: requirements.txt not found, installing packages individually..."
    pip3 install easyocr>=1.7.0
    pip3 install opencv-python>=4.8.0
    pip3 install numpy>=1.24.0
    pip3 install Pillow>=10.0.0
    pip3 install pdf2image>=1.16.0
    pip3 install PyPDF2>=3.0.0
fi

echo "✓ Python packages installed"

# Test installations
echo ""
echo "[5/6] Testing installations..."

# Test EasyOCR
echo -n "  Testing EasyOCR... "
if python3 -c "import easyocr" 2>/dev/null; then
    echo "✓"
else
    echo "✗ FAILED"
    echo "ERROR: EasyOCR import failed"
    exit 1
fi

# Test pdf2image
echo -n "  Testing pdf2image... "
if python3 -c "from pdf2image import convert_from_path" 2>/dev/null; then
    echo "✓"
else
    echo "✗ FAILED"
    echo "ERROR: pdf2image import failed"
    exit 1
fi

# Test OpenCV
echo -n "  Testing OpenCV... "
if python3 -c "import cv2" 2>/dev/null; then
    echo "✓"
else
    echo "✗ FAILED"
    echo "ERROR: OpenCV import failed"
    exit 1
fi

# Download EasyOCR models (English)
echo ""
echo "[6/6] Downloading EasyOCR models (first time only)..."
echo "  This will download ~150MB of language models..."
echo "  Models are cached for future use."
echo ""

python3 -c "
import easyocr
print('[EasyOCR] Initializing reader and downloading models...')
reader = easyocr.Reader(['en'], model_storage_directory='/tmp/easyocr_models', verbose=False)
print('[EasyOCR] Models downloaded successfully')
" || echo "WARNING: Model download may have failed, but will retry on first use"

# Summary
echo ""
echo "========================================="
echo "✓ Installation Complete!"
echo "========================================="
echo ""
echo "Installed components:"
echo "  ✓ EasyOCR (Python OCR engine)"
echo "  ✓ pdf2image (PDF processing)"
echo "  ✓ OpenCV (image preprocessing)"
echo "  ✓ poppler-utils (PDF utilities)"
echo ""
echo "Next steps:"
echo "  1. Deploy backend code with EasyOCR provider"
echo "  2. Restart backend service: systemctl restart trade-show-app-backend"
echo "  3. Test OCR endpoint with sample receipt"
echo ""
echo "Documentation:"
echo "  - Backend: /opt/trade-show-app/backend/OCR_EASYOCR_MIGRATION.md"
echo "  - Master Guide: /opt/trade-show-app/docs/AI_MASTER_GUIDE.md"
echo ""
echo "========================================="

