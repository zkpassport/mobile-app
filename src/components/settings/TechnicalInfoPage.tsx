import { Colors } from "@/constants/Colors"
import React from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native"
import { BackButton, PrimaryButton } from "@/components/ui/Buttons"
import { getCscaForPassportAsync, PassportViewModel } from "@zkpassport/utils"
import { useSettings } from "@/context/SettingsContext"
import { useTranslation } from "react-i18next"
import { useState, useEffect } from "react"
import { PackagedCertificate } from "@zkpassport/utils"
import {
  getSodSignatureAlgorithmType,
  extractTBS,
  getRSAInfo,
  getECDSAInfo,
} from "@zkpassport/utils"
import {
  getBitSize,
  getCurrentDateYYMMDD,
  sendAnonymousMetadata,
  getVersion,
  formatRAM,
  formatLongDate,
} from "@/lib"
import { RegistryClient } from "@zkpassport/registry"
import { FaceMatchService } from "@/services/facematch/facematch"
import { DiskStorageService } from "@/services/StorageService"
import AppAttest from "../../../modules/app-attest-module"
import * as Clipboard from "expo-clipboard"
import * as Device from "expo-device"
import { Buffer } from "buffer/"
import { format } from "date-fns"
import { fr, enUS } from "date-fns/locale"
import { getAuthorityKeyIdFromDSC } from "@/lib/utils/sodUtils"
import { AlertModal } from "../Modals/AlertModal"
import { MetadataCloud } from "@/assets/images/icons/MetadataCloud"
import { ToggleCard, IDCardPreview } from "../ui/Cards"
import { CopyIcon } from "@/assets/images/icons/CopyIcon"
import { UploadIcon } from "@/assets/images/icons/UploadIcon"
import { Trash } from "@/assets/images/icons/Trash"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { Phone } from "lucide-react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface InfoRowProps {
  label: string
  value?: string
  vertical?: boolean
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, vertical }) => {
  if (!value) return null

  return (
    <View style={vertical ? styles.infoRowVert : styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

interface TechnicalInfoPageProps {
  passport: PassportViewModel
  onBack: () => void
}

// TODO: Add facematch debug and cache clearing

const TechnicalInfoPage: React.FC<TechnicalInfoPageProps> = ({ passport, onBack }) => {
  const { settings, updateSettings } = useSettings()
  const [isSubmittingMetadata, setIsSubmittingMetadata] = useState(false)
  const { t, i18n } = useTranslation()
  const [csc, setCsc] = useState<PackagedCertificate | undefined>(undefined)
  const [isLoadingCsc, setIsLoadingCsc] = useState(false)
  const [showMetadataModal, setShowMetadataModal] = useState(false)
  const [includeSignerInfo, setIncludeSignerInfo] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (passport) {
      getCsc(passport)
    }
  }, [passport])

  let rsaExponent = ""
  let rsaModulusSize: number | undefined = undefined
  let curveName = ""
  if (getSodSignatureAlgorithmType(passport) === "RSA") {
    const tbsCertificate = extractTBS(passport)
    if (tbsCertificate) {
      const { modulus, exponent } = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
      rsaModulusSize = getBitSize(modulus)
      rsaExponent = exponent.toString()
    }
  } else if (getSodSignatureAlgorithmType(passport) === "ECDSA") {
    const tbsCertificate = extractTBS(passport)
    if (tbsCertificate) {
      const { curve } = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
      curveName = curve
    }
  }

  const getCsc = async (passportData: PassportViewModel) => {
    try {
      setIsLoadingCsc(true)
      const registryClient = new RegistryClient({
        chainId: 11155111,
      })
      const { certificates } = await registryClient.getCertificates(undefined, {
        validate: false,
      })
      const csc = await getCscaForPassportAsync(passportData.sod.certificate, certificates)
      if (csc) {
        setCsc(csc)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingCsc(false)
    }
  }

  const eContentLen = passport.sod.encapContentInfo.eContent.bytes.length
  const signedAttrLen = passport.sod.signerInfo.signedAttrs.bytes.length
  const dataGroups = passport.dataGroups

  const copyToClipboard = async (data: number[] | string | undefined) => {
    if (data) {
      if (typeof data === "string") {
        await Clipboard.setStringAsync(data)
      } else {
        let base64 = Buffer.from(data).toString("base64")
        await Clipboard.setStringAsync(base64)
      }
      Alert.alert(t("settings.debugInfo.copied"), t("settings.debugInfo.copiedToClipboard"))
    }
  }

  const copyImage = async (image: string) => {
    if (image) {
      try {
        await Clipboard.setImageAsync(
          image.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", ""),
        )
        Alert.alert(t("settings.debugInfo.copied"), t("settings.debugInfo.imageCopied"))
      } catch {
        console.error("Error copying image")
        await Clipboard.setStringAsync(image)
        Alert.alert(t("settings.debugInfo.copied"), t("settings.debugInfo.somethingWrongWithImage"))
      }
    }
  }

  const onSendMetadata = async () => {
    setShowMetadataModal(true)
  }

  const handleSendMetadata = async () => {
    try {
      setShowMetadataModal(false)
      setIsSubmittingMetadata(true)
      const { success } = await sendAnonymousMetadata(
        passport,
        csc,
        false,
        false,
        includeSignerInfo,
      )
      if (success) {
        Alert.alert(t("success"), t("settings.debugInfo.success"))
      } else {
        Alert.alert(t("error"), t("settings.debugInfo.error"))
      }
    } catch (error) {
      console.error(error)
      Alert.alert(t("error"), t("settings.debugInfo.error"))
    } finally {
      setIsSubmittingMetadata(false)
      setIncludeSignerInfo(false)
    }
  }

  const handleCancelMetadata = () => {
    setShowMetadataModal(false)
    setIncludeSignerInfo(false)
  }

  const formatSystemDate = () => {
    const currentDate = getCurrentDateYYMMDD()
    const year = parseInt(`20${currentDate.substring(0, 2)}`)
    const month = parseInt(currentDate.substring(2, 4)) - 1
    const day = parseInt(currentDate.substring(4, 6))

    const date = new Date(year, month, day)
    const locale = i18n.language === "fr" ? fr : enUS
    let dateFormat = "MMMM do, yyyy"
    if (i18n.language === "fr") {
      dateFormat = "d MMMM yyyy"
    }

    return format(date, dateFormat, { locale })
  }

  const clearFaceMatchCache = async () => {
    try {
      const storage = new DiskStorageService()
      const facematch = new FaceMatchService({ storage, appAttest: AppAttest })
      for (const passportItem of settings.passports) {
        await facematch.removeKeyId(passportItem.id)
      }
      Alert.alert(t("success"), t("settings.debugInfo.faceMatchCacheCleared"))
    } catch (error) {
      console.error("Error clearing facematch cache:", error)
      Alert.alert(t("error"), t("settings.debugInfo.errorClearingFaceMatchCache"))
    }
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("Back")} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {/* ID Card Preview */}
          <View style={styles.idCardPreviewContainer}>
            <IDCardPreview passport={passport} />
          </View>

          {/* ID Technical Information */}
          <View style={styles.section}>
            <View style={styles.sectionContent}>
              <Text style={styles.sectionTitle}>{t("settings.debugInfo.idTechnicalSection")}</Text>

              <InfoRow label={t("settings.debugInfo.ldsVersion")} value={passport.LDSVersion} />
              <InfoRow
                label={t("settings.debugInfo.cmsVersion")}
                value={passport.sod.version.toString()}
              />
              <InfoRow
                label={t("settings.debugInfo.dscSigAlg")}
                value={passport.sod.certificate.signatureAlgorithm.name}
              />
              <InfoRow
                label={t("settings.debugInfo.sodSigAlg")}
                value={passport.sod.signerInfo.signatureAlgorithm.name}
              />
              {rsaExponent && (
                <InfoRow label={t("settings.debugInfo.sodRsaExponent")} value={rsaExponent} />
              )}
              {rsaModulusSize && (
                <InfoRow
                  label={t("settings.debugInfo.sodRsaModulus")}
                  value={`${rsaModulusSize} bits`}
                />
              )}
              {curveName && <InfoRow label={t("settings.debugInfo.sodCurve")} value={curveName} />}
              <InfoRow
                label={t("settings.debugInfo.eContentHashAlg")}
                value={passport.sod.encapContentInfo.eContent.hashAlgorithm}
              />
              <InfoRow
                label={t("settings.debugInfo.signedAttrHashAlg")}
                value={passport.sod.signerInfo.digestAlgorithm}
              />
              <InfoRow label={t("settings.debugInfo.eContentLen")} value={eContentLen.toString()} />
              <InfoRow
                label={t("settings.debugInfo.signedAttrLen")}
                value={signedAttrLen.toString()}
              />
              {passport.sod.certificate.tbs && (
                <InfoRow
                  label={t("settings.debugInfo.dscTbsCertificateLen")}
                  value={passport.sod.certificate.tbs.bytes.length.toString()}
                />
              )}
            </View>
          </View>

          {/* Country Signing Certificate */}
          <View style={styles.section}>
            <View style={styles.sectionContent}>
              <Text style={styles.sectionTitle}>{t("settings.debugInfo.cscSection")}</Text>

              {isLoadingCsc ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#FBFBFB" />
                  <Text style={styles.loadingText}>{t("settings.debugInfo.loadingCsc")}</Text>
                </View>
              ) : csc ? (
                <>
                  <InfoRow label={t("settings.debugInfo.cscCountry")} value={csc.country} />
                  <InfoRow
                    label={t("settings.debugInfo.cscSignatureAlgorithm")}
                    value={csc.signature_algorithm}
                  />
                  <InfoRow label={t("settings.debugInfo.cscKeyType")} value={csc.public_key.type} />
                  {csc.public_key.type === "RSA" && (
                    <>
                      <InfoRow
                        label={t("settings.debugInfo.cscKeySize")}
                        value={`${csc.public_key.key_size} bits`}
                      />
                      <InfoRow
                        label={t("settings.debugInfo.cscExponent")}
                        value={`${csc.public_key.exponent}`}
                      />
                    </>
                  )}
                  {csc.public_key.type === "EC" && (
                    <InfoRow
                      label={t("settings.debugInfo.cscCurve")}
                      value={csc.public_key.curve}
                    />
                  )}
                  {csc.validity && (
                    <>
                      <InfoRow
                        label={t("settings.debugInfo.cscValidFrom")}
                        value={formatLongDate(new Date(csc.validity.not_before * 1000))}
                      />
                      <InfoRow
                        label={t("settings.debugInfo.cscValidTo")}
                        value={formatLongDate(new Date(csc.validity.not_after * 1000))}
                      />
                    </>
                  )}
                  {csc.subject_key_identifier && (
                    <InfoRow
                      label={t("settings.debugInfo.cscSubjectKey")}
                      value={csc.subject_key_identifier}
                      vertical={true}
                    />
                  )}
                  {csc.authority_key_identifier && (
                    <InfoRow
                      label={t("settings.debugInfo.cscAuthKey")}
                      value={csc.authority_key_identifier}
                      vertical={true}
                    />
                  )}
                </>
              ) : (
                <Text style={styles.noDataText}>{t("settings.debugInfo.noCscFound")}</Text>
              )}
            </View>
          </View>

          {/* Data Groups */}
          <View style={styles.section}>
            <View style={styles.sectionContent}>
              <Text style={styles.sectionTitle}>{t("settings.debugInfo.dataGroups")}</Text>

              <Text style={styles.dataGroupsText}>
                {dataGroups
                  ?.sort((a, b) => a.groupNumber - b.groupNumber)
                  ?.map(
                    (dg, index) =>
                      `${dg.name} ${dg.value.length > 0 ? `(${dg.value.length})` : ""}${
                        index < dataGroups.length - 1 ? ", " : ""
                      }`,
                  )
                  .join("")}
              </Text>
            </View>
          </View>

          {/* System Information */}
          <View style={styles.section}>
            <View style={styles.sectionContentInfo}>
              <Text style={styles.sectionTitle}>{t("settings.debugInfo.systemSection")}</Text>
              <InfoRow label={t("settings.debugInfo.systemDate")} value={formatSystemDate()} />
              <View style={styles.systemGrid}>
                <View style={styles.systemGridItem}>
                  <Phone size={18} color="white" />
                  <Text style={styles.systemGridLabel}>{t("settings.debugInfo.phone")}</Text>
                  <Text style={styles.systemGridValue}>{Device.modelName}</Text>
                </View>
                <View style={styles.systemGridItem}>
                  {Platform.OS === "ios" ? (
                    <Ionicons name="logo-apple" size={18} color="white" />
                  ) : (
                    <Ionicons name="logo-android" size={18} color="white" />
                  )}
                  <Text style={styles.systemGridLabel}>{t("settings.debugInfo.os")}</Text>
                  <Text style={styles.systemGridValue}>
                    {Platform.OS} {Platform.Version}
                  </Text>
                </View>
                <View style={styles.systemGridItem}>
                  <Ionicons name="apps-outline" size={18} color="white" />
                  <Text style={styles.systemGridLabel}>{t("settings.debugInfo.app")}</Text>
                  <Text style={styles.systemGridValue}>{getVersion()}</Text>
                </View>
                <View style={styles.systemGridItem}>
                  <Ionicons name="hardware-chip-outline" size={18} color="white" />
                  <Text style={styles.systemGridLabel}>{t("settings.debugInfo.ram")}</Text>
                  <Text style={styles.systemGridValue}>{formatRAM(Device.totalMemory ?? 0)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Actions Section */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>{t("settings.debugInfo.actions")}</Text>

            {/* Toggle Card for the Facematch Debug */}
            <ToggleCard
              title={t("settings.technicalInfo.faceMatchDebug")}
              description={t("settings.technicalInfo.faceMatchDebugDescription")}
              value={settings.faceMatchDebug ?? false}
              onChange={(value: boolean) => updateSettings({ faceMatchDebug: value })}
            />

            <View style={styles.buttonRow}>
              <View style={styles.buttonHalfWrapper}>
                <PrimaryButton
                  text={t("settings.debugInfo.copyDG1")}
                  onPress={() =>
                    copyToClipboard(passport.dataGroups?.find((x) => x.groupNumber === 1)?.value)
                  }
                  primary
                  bold
                  halfWidth
                  icon={<CopyIcon width={20} height={20} color={"black"} />}
                />
              </View>

              <View style={styles.buttonHalfWrapper}>
                <PrimaryButton
                  text={t("settings.debugInfo.copySOD")}
                  onPress={() => copyToClipboard(passport.sod.bytes.toNumberArray())}
                  primary
                  bold
                  halfWidth
                  icon={<CopyIcon width={20} height={20} color={"black"} />}
                />
              </View>
            </View>

            <View style={styles.buttons}>
              <PrimaryButton
                text={t("settings.technicalInfo.copyPhotoDG2")}
                onPress={() => copyImage(passport.originalPhoto)}
                primary
                bold
                icon={<CopyIcon width={20} height={20} color={"black"} />}
              />

              <PrimaryButton
                text={t("settings.debugInfo.copyDG2Base64")}
                onPress={() =>
                  copyToClipboard(passport.dataGroups?.find((x) => x.groupNumber === 2)?.value)
                }
                primary
                bold
                icon={<CopyIcon width={20} height={20} color={"black"} />}
              />

              <PrimaryButton
                text={t("settings.debugInfo.copySubjectKeyId")}
                onPress={() => {
                  let ski = ""
                  if (csc?.subject_key_identifier) {
                    ski = csc.subject_key_identifier
                  } else {
                    ski = getAuthorityKeyIdFromDSC(passport) || "Not found"
                  }
                  copyToClipboard(ski)
                }}
                primary
                bold
                icon={<CopyIcon width={20} height={20} color={"black"} />}
              />

              <PrimaryButton
                text={t("settings.debugInfo.clearFaceMatchCache")}
                onPress={clearFaceMatchCache}
                primary
                bold
                icon={
                  <View style={{ marginRight: -3 }}>
                    <Trash width={22} height={22} color="black" />
                  </View>
                }
              />

              <PrimaryButton
                text={
                  isSubmittingMetadata
                    ? t("settings.debugInfo.submitting")
                    : t("settings.debugInfo.submitAnonymousMetadata")
                }
                onPress={onSendMetadata}
                bold
                icon={
                  isSubmittingMetadata ? (
                    <ActivityIndicator size="small" color="#F3D7A1" />
                  ) : (
                    <View style={{ marginRight: -8 }}>
                      <UploadIcon width={20} height={20} />
                    </View>
                  )
                }
              />
            </View>
          </View>
        </ScrollView>

        {/* MetadataConfirmModal */}
        <AlertModal
          visible={showMetadataModal}
          onClose={handleCancelMetadata}
          onAccept={handleSendMetadata}
          iconSize={64}
          title={t("settings.technicalInfo.submitMetadataTitle")}
          description={t("settings.technicalInfo.submitMetadataDescription")}
          buttonText={t("settings.technicalInfo.submitMetadataButton")}
          buttonText2={t("settings.technicalInfo.cancel")}
          buttonIcon={<MetadataCloud />}
        />
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
  scrollView: {
    flex: 1,
  },
  idCardPreviewContainer: {
    marginTop: 20,
    marginBottom: 8,
  },
  section: {
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    // fontFamily: "Inter",
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  sectionContent: {
    backgroundColor: "#2A3771",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sectionContentInfo: {
    backgroundColor: "#2A3771",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    paddingVertical: 2,
  },
  infoRowVert: {
    flexDirection: "column",
    gap: 12,
    marginBottom: 12,
    paddingVertical: 2,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "400",
    color: "#A8B4D1",
    // fontFamily: "Inter",
    marginRight: 8,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#FFFFFF",
    // fontFamily: "Inter",
    textAlign: "left",
  },
  dataGroupsText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#FFFFFF",
    // fontFamily: "Inter",
    lineHeight: 20,
    paddingBottom: 12,
  },
  systemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingTop: 4,
  },
  systemGridItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#1E2B54",
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  systemGridIcon: {
    fontSize: 24,
    marginBottom: 10,
  },
  systemGridLabel: {
    fontSize: 11,
    fontWeight: "400",
    color: "#A8B4D1",
    // fontFamily: "Inter",
    marginVertical: 10,
  },
  systemGridValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    // fontFamily: "Inter",
    textAlign: "center",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  loadingText: {
    color: "#FBFBFB",
    marginLeft: 8,
    fontSize: 16,
  },
  noDataText: {
    color: "#FBFBFB",
    fontSize: 16,
    textAlign: "center",
    padding: 8,
  },
  actionsSection: {
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  buttonHalfWrapper: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    backgroundColor: Colors.dark.background,
    padding: 24,
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  modalIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(33, 57, 163, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2139A3",
  },
  modalTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  modalTitle: {
    color: "#FBFBFB",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 2,
  },
  modalSubtitle: {
    color: "#B8C5E0",
    fontSize: 14,
    fontWeight: "500",
  },
  modalDescription: {
    color: "#FBFBFB",
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20,
  },
  optionSection: {
    backgroundColor: "rgba(59, 91, 152, 0.3)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 6,
    marginRight: 12,
    marginTop: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2139A3",
    borderColor: "#2139A3",
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    color: "#FBFBFB",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  checkboxSubtext: {
    color: "#B8C5E0",
    fontSize: 14,
    fontWeight: "400",
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 149, 0, 0.1)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 149, 0, 0.3)",
  },
  warningIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 149, 0, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginTop: 1,
  },
  warningText: {
    color: "#FBFBFB",
    fontSize: 14,
    lineHeight: 18,
    flex: 1,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#FBFBFB",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#2139A3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2139A3",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonIcon: {
    marginRight: 8,
  },
  confirmButtonText: {
    color: "#FBFBFB",
    fontSize: 16,
    fontWeight: "600",
  },
  buttons: {
    flexDirection: "column",
    gap: 16,
    marginVertical: 8,
  },
})

export default TechnicalInfoPage
