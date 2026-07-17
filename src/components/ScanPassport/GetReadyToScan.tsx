import React, { useEffect, useMemo } from "react"
import { View, Text, StyleSheet, Image, BackHandler } from "react-native"
import { DocumentType } from "@/types/DocumentInfo"
import { BackButton, PrimaryButton } from "@/components/ui/Buttons"
import { FlipIcon } from "@/assets/images/icons/FlipIcon"
import { Colors } from "@/constants/Colors"
import StepList, { Step } from "../ui/StepList"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type ContentCfg = {
  nameKey: string
  descriptionKey: string
  image: any // ImageSourcePropType
  isCard: boolean // whether extra flip UI / sizing applies
}

const IMAGES = {
  passportSkeleton: require("@/assets/images/Passport/PassportSkeleton.png"),
  idCardSkeleton: require("@/assets/images/IDCard/IDCardSkeleton.png"),
} as const

const CONTENT: Record<Exclude<DocumentType, DocumentType.OTHER>, ContentCfg> = {
  [DocumentType.PASSPORT]: {
    nameKey: "scanning.getReadyToScan.passport.name",
    descriptionKey: "scanning.getReadyToScan.passport.description",
    image: IMAGES.passportSkeleton,
    isCard: false,
  },
  [DocumentType.ID_CARD]: {
    nameKey: "scanning.getReadyToScan.idCard.name",
    descriptionKey: "scanning.getReadyToScan.idCard.description",
    image: IMAGES.idCardSkeleton,
    isCard: true,
  },
  [DocumentType.RESIDENCE_PERMIT]: {
    nameKey: "scanning.getReadyToScan.residencePermit.name",
    descriptionKey: "scanning.getReadyToScan.residencePermit.description",
    image: IMAGES.idCardSkeleton,
    isCard: true,
  },
}

interface GetReadyToScanProps {
  onBack: () => void
  onStartScan: () => void
  onManualEntry?: () => void
  showManualEntry?: boolean
  idType: DocumentType
}

export const GetReadyToScan: React.FC<GetReadyToScanProps> = ({
  onBack,
  onStartScan,
  onManualEntry,
  showManualEntry = false,
  idType,
}) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const contentConfig = useMemo(
    () => CONTENT[idType as keyof typeof CONTENT] ?? CONTENT[DocumentType.PASSPORT],
    [idType],
  )

  useEffect(() => {
    const onBackPress = () => {
      onBack()
      return true
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress)
    return () => subscription.remove()
  }, [])

  const steps: Step[] = useMemo(
    () => [
      {
        number: "1",
        text: `${t(contentConfig.nameKey)}${t("scanning.getReadyToScan.steps.nfc")}`,
        completed: true,
      },
      {
        number: "2",
        text: t("scanning.getReadyToScan.steps.scan"),
        completed: false,
      },
    ],
    [t, contentConfig],
  )

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.container}>
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("scanning.back")} />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{t("scanning.getReadyToScan.title")}</Text>

          <Text style={styles.description}>{t(contentConfig.descriptionKey)}</Text>

          <View
            style={[
              styles.illustrationContainer,
              (idType === DocumentType.ID_CARD || idType === DocumentType.RESIDENCE_PERMIT) &&
                styles.illustrationContainerSmall,
              showManualEntry && styles.illustrationContainerCompact,
            ]}
          >
            <Image
              source={contentConfig.image}
              style={[
                styles.illustration,
                (idType === DocumentType.ID_CARD || idType === DocumentType.RESIDENCE_PERMIT) &&
                  styles.illustrationSmall,
                showManualEntry && styles.illustrationCompact,
                showManualEntry &&
                  (idType === DocumentType.ID_CARD || idType === DocumentType.RESIDENCE_PERMIT) &&
                  styles.illustrationSmallCompact,
              ]}
              resizeMode="contain"
            />
          </View>

          {(idType === DocumentType.ID_CARD || idType === DocumentType.RESIDENCE_PERMIT) && (
            <View style={[styles.flipContainer, showManualEntry && styles.flipContainerCompact]}>
              <FlipIcon width={40} height={22} color="#F6D38F" />
              <Text style={styles.flipText}>{t("scanning.getReadyToScan.flipID")}</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.checklistContainer}>
            <StepList
              steps={steps}
              variant="compact"
              showCheckmarks
              connectorHeight={32}
              showLastConnector
              textStyle={{ fontSize: 20, fontWeight: "500", lineHeight: 28 }}
            />
          </View>

          <PrimaryButton
            text={t("scanning.getReadyToScan.startScan")}
            onPress={onStartScan}
            primary
          />
          {showManualEntry && onManualEntry && (
            <PrimaryButton
              text={t("scanning.getReadyToScan.enterManually")}
              onPress={onManualEntry}
            />
          )}
        </View>
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
    paddingHorizontal: 16,
  },
  backButton: {
    paddingVertical: 16,
  },
  content: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    color: "#FBFBFB",
    textAlign: "center",
    marginBottom: 10,
    marginTop: 30,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#E7E7E7",
    textAlign: "center",
    lineHeight: 22,
    // fontFamily: "Inter",
    fontWeight: "400",
    marginBottom: 16,
  },
  bold: {
    fontWeight: "700",
  },
  illustrationContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 32,
  },
  illustrationContainerSmall: {
    width: "100%",
    marginBottom: 16,
  },
  illustrationContainerCompact: {
    marginBottom: 16,
  },
  illustration: {
    width: 300,
    height: 300,
  },
  illustrationSmall: {
    width: 340,
    height: 200,
  },
  illustrationCompact: {
    width: 220,
    height: 220,
  },
  illustrationSmallCompact: {
    width: 280,
    height: 160,
  },
  flipContainer: {
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  flipContainerCompact: {
    marginBottom: 8,
    gap: 4,
  },
  flipText: {
    fontSize: 14,
    // fontFamily: "Inter",
    fontWeight: "500",
    lineHeight: 20,
    color: "#F6D38F",
  },
  checklistContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 0,
    marginBottom: -56,
    width: "100%",
  },
  bottomSection: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 24,
  },
})
