#!/bin/bash

# Setup script for Google Play Asset Delivery
# This script creates the asset pack structure and moves large files

set -e

echo "🚀 Setting up Google Play Asset Delivery..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📁 Creating asset pack directories..."

# Create facematch_models asset pack
mkdir -p android/facematch_models/src/main/assets/models
cat > android/facematch_models/build.gradle << 'EOF'
plugins {
  id 'com.android.asset-pack'
}

assetPack {
    packName = "facematch_models"
    dynamicDelivery {
        deliveryType = "install-time"
    }
}
EOF

# Create proving_artifacts asset pack
mkdir -p android/proving_artifacts/src/main/assets
cat > android/proving_artifacts/build.gradle << 'EOF'
plugins {
  id 'com.android.asset-pack'
}

assetPack {
    packName = "proving_artifacts"
    dynamicDelivery {
        deliveryType = "install-time"
    }
}
EOF

echo "📦 Moving large files to asset packs..."

# Move face recognition models (move instead of copy to avoid duplication)
if [ -f "modules/facematch/android/src/main/assets/models/arcface.ort" ]; then
    mv modules/facematch/android/src/main/assets/models/arcface.ort android/facematch_models/src/main/assets/models/
    echo "  ✓ Moved arcface.ort (166 MB)"
else
    echo "  ⚠️  arcface.ort not found"
fi

if [ -f "modules/facematch/android/src/main/assets/models/scrfd_2.5g_bnkps.ort" ]; then
    mv modules/facematch/android/src/main/assets/models/scrfd_2.5g_bnkps.ort android/facematch_models/src/main/assets/models/
    echo "  ✓ Moved scrfd_2.5g_bnkps.ort (3.2 MB)"
else
    echo "  ⚠️  scrfd_2.5g_bnkps.ort not found"
fi

# Move SRS file (move instead of copy to avoid duplication)
if [ -f "android/app/src/main/res/raw/srs_21.local" ]; then
    mv android/app/src/main/res/raw/srs_21.local android/proving_artifacts/src/main/assets/
    echo "  ✓ Moved srs_21.local (128 MB)"
else
    echo "  ⚠️  srs_21.local not found"
fi

echo ""
echo "✅ Asset pack structure created!"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Update android/settings.gradle to include asset packs:"
echo "   include ':facematch_models'"
echo "   include ':proving_artifacts'"
echo "   project(':facematch_models').projectDir = new File(rootProject.projectDir, './app/facematch_models')"
echo "   project(':proving_artifacts').projectDir = new File(rootProject.projectDir, './app/proving_artifacts')"
echo ""
echo "2. Add Play Core dependency to android/app/build.gradle:"
echo "   implementation 'com.google.android.play:asset-delivery:2.2.2'"
echo "   implementation 'com.google.android.play:asset-delivery-ktx:2.2.2'"
echo ""
echo "3. Register AssetDeliveryModule in MainApplication.kt"
echo ""
echo "4. Test with bundletool:"
echo "   cd android && ./gradlew bundleRelease"
echo ""
echo "📚 See PLAY_ASSET_DELIVERY_SOLUTION.md for complete instructions"

