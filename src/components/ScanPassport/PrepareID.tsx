import React, { useEffect, useMemo } from "react"
import { View, Text, StyleSheet, BackHandler, Dimensions } from "react-native"
import { useVideoPlayer, VideoView } from "expo-video"
import { Colors } from "@/constants/Colors"
import { BackButton, PrimaryButton } from "@/components/ui/Buttons"
import { DocumentType } from "@/types/DocumentInfo"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { Trans, useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const { width: SCREEN_WIDTH } = Dimensions.get("window")

interface PrepareIDViewProps {
  onBack: () => void
  onScan: () => void
  // onDebugManualMRZ?: () => void
  documentType?: DocumentType
}

function getVideo(documentType: DocumentType) {
  if (documentType === DocumentType.PASSPORT) {
    return require("@/assets/videos/nfc_anim_passport.mov")
  }
  return require("@/assets/videos/nfc_anim_id_card.mov")
}

export const PrepareIDView: React.FC<PrepareIDViewProps> = ({
  onBack,
  onScan,
  // onDebugManualMRZ,
  documentType = DocumentType.ID_CARD,
}) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const player = useVideoPlayer(getVideo(documentType), (player) => {
    player.loop = true
    player.play()
    player.muted = true
  })

  const content = useMemo(() => {
    let descriptionKey = "scanning.prepareID.passport"
    if (documentType === DocumentType.ID_CARD) {
      descriptionKey = "scanning.prepareID.idCard"
    } else if (documentType === DocumentType.RESIDENCE_PERMIT) {
      descriptionKey = "scanning.prepareID.residencePermit"
    }
    return {
      titleKey: "scanning.prepareID.title",
      descriptionKey,
    }
  }, [documentType])

  // Drive animations based on page
  useEffect(() => {
    player.play()
  }, [])

  const goBack = () => {
    onBack()
  }

  // Handle back button/gesture
  useEffect(() => {
    const onBackPress = () => {
      goBack()
      return true
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)

    return () => subscription.remove()
  }, [])

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.container}>
        <View style={styles.backButton}>
          <BackButton onPress={goBack} text={t("scanning.back")} />
        </View>

        <View style={styles.content}>
          <View style={styles.imageContainer}>
            <VideoView player={player} style={styles.video} />
          </View>

          <Text style={styles.title}>{t(content?.titleKey ?? "")}</Text>

          <Text style={styles.description}>
            <Trans
              i18nKey={content.descriptionKey}
              components={{
                bold: (
                  <Text
                    style={{
                      fontWeight: "700",
                    }}
                  />
                ),
                em: (
                  <Text
                    style={{
                      fontWeight: "700",
                      color: "#F6D38F",
                    }}
                  />
                ),
              }}
            />
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <PrimaryButton text={t("scanning.prepareID.startScan")} onPress={onScan} primary />
        </View>

        {/* Debug button
        {onDebugManualMRZ && (
          <TouchableOpacity style={styles.debugButton} onPress={onDebugManualMRZ}>
            <Text style={styles.debugButtonText}>Debug: Manual MRZ</Text>
          </TouchableOpacity>
        )} */}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingTop: OUTER_CONTAINER_TOP_PADDING,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  backButton: {
    paddingVertical: 16,
  },
  content: {
    flex: 1,
    alignItems: "center",
  },
  imageContainer: {
    width: SCREEN_WIDTH + 16,
    alignItems: "center",
    marginHorizontal: -16,
  },
  video: {
    width: "100%",
    aspectRatio: 1,
  },
  title: {
    paddingTop: 24,
    fontSize: 40,
    fontWeight: "600",
    lineHeight: 48,
    color: "#FBFBFB",
    textAlign: "center",
    paddingBottom: 10,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#E7E7E7",
    lineHeight: 22,
    // fontFamily: "Inter",
    fontWeight: "400",
    maxWidth: 320,
    marginBottom: 40,
    textAlign: "center",
  },
  bottomSection: {
    width: "100%",
    paddingVertical: 12,
  },
  buttonContainer: {
    flex: 1,
    marginLeft: 40,
    paddingBottom: 10,
  },
  debugButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
    backgroundColor: "rgba(255, 0, 0, 0.7)",
    padding: 10,
    borderRadius: 8,
    zIndex: 1000,
  },
  debugButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  buttonIcon: {
    marginTop: 2,
    marginLeft: 5,
  },
})
