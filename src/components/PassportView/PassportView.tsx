import React from "react"
import { View, Text, StyleSheet, Image, ImageBackground, Dimensions, Platform } from "react-native"
import { PassportViewModel } from "@zkpassport/utils"
import { PassportIcon } from "@/assets/images/icons/PassportIcon"
import { CountryOfIssuance } from "./CountryOfIssuance"
import Checkmark from "@/assets/images/icons/Checkmark"
import { RedAlert } from "@/assets/images/icons/RedAlert"
import { capitalizeEveryWord, formatDateDisplay, getCountryName, getGender } from "@/lib"
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated"
import { IDCardIcon } from "@/assets/images/icons/IDCardIcon"
import { ResidencePermitIcon } from "@/assets/images/icons/ResidencePermitIcon"
import { useTranslation } from "react-i18next"
import { getDocumentType, getIssuingCountryCode } from "@/lib/credentials"

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const CARD_WIDTH = SCREEN_WIDTH - 40
// Keep the ratio of the card background image by using the width as reference

interface PassportViewProps {
  passport: PassportViewModel
  showDetails?: boolean
  countryCode?: string
  isUnsupported?: boolean
  isExpired?: boolean
  scrollX?: SharedValue<number>
  index?: number
}

export const PassportView: React.FC<PassportViewProps> = ({
  passport,
  showDetails = false,
  isUnsupported = false,
  isExpired = false,
  scrollX,
  index = 0,
}) => {
  const { t } = useTranslation()
  const documentType =
    passport && passport.mrz
      ? getDocumentType(passport.mrz, getIssuingCountryCode(passport), passport.nationality)
      : undefined

  // Helper function to validate base64 image
  const isValidBase64Image = (str: string): boolean => {
    if (!str) return false
    return str.startsWith("data:image/")
  }

  // Helper function to get display value
  const getDisplayValue = (value: string, maskLength: number = 9) => {
    return showDetails ? value : "*".repeat(maskLength)
  }

  const rnAnimatedStyle = useAnimatedStyle(() => {
    if (!scrollX) {
      return {}
    }
    const width = SCREEN_WIDTH
    return {
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            [(index - 1) * width, index * width, (index + 1) * width],
            [-CARD_WIDTH * 0.12, 0, CARD_WIDTH * 0.12],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            scrollX.value,
            [(index - 1) * width, index * width, (index + 1) * width],
            [0.9, 1, 0.9],
            Extrapolation.CLAMP,
          ),
        },
      ],
    }
  })

  if (!passport) {
    return null
  }

  const name = capitalizeEveryWord(passport.name)
  const nationality = getCountryName(passport.nationality)
  const gender = getGender(passport.gender)

  return (
    <Animated.View style={[styles.cardContainer, rnAnimatedStyle]}>
      <View style={[styles.cardWrapper, (isUnsupported || isExpired) && styles.cardWrapperError]}>
        {/* ID Card */}
        <ImageBackground
          source={require("@/assets/images/IDCard/ID_card.png")}
          style={styles.idCard}
          imageStyle={styles.idCardImage}
          resizeMode="cover"
        >
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              {documentType === "passport" && <PassportIcon width={24} height={24} />}
              {documentType === "id_card" && <IDCardIcon width={24} height={24} />}
              {documentType === "residence_permit" && (
                <ResidencePermitIcon width={24} height={24} />
              )}
              <Text style={styles.cardType}>
                {documentType === "passport" && t("passportView.documentType.passport")}
                {documentType === "id_card" && t("passportView.documentType.idCard")}
                {documentType === "residence_permit" &&
                  t("passportView.documentType.residencePermit")}
              </Text>
            </View>

            <View style={styles.countryContainer}>
              <CountryOfIssuance passport={passport} />
            </View>
          </View>

          {/* Card Body */}
          <View style={styles.cardBody}>
            {/* Photo */}
            <View style={styles.photoContainer}>
              {passport.photo &&
                typeof passport.photo === "string" &&
                isValidBase64Image(passport.photo) && (
                  <View style={styles.photo}>
                    <Image
                      source={{ uri: passport.photo.trim() }}
                      style={styles.photoImage}
                      resizeMode="contain"
                      blurRadius={showDetails ? 0 : 40}
                    />
                  </View>
                )}
              <View style={styles.genuineBadge}>
                <Checkmark width={12} height={12} color="#60BA6C" />
                <Text style={styles.genuineText}>{t("passportView.idIsGenuine")}</Text>
              </View>
            </View>

            {/* Details */}
            <View style={styles.detailsContainer}>
              <Text style={styles.detailLabel}>{t("passportView.name")}</Text>
              <Text style={styles.detailValue}>{getDisplayValue(name)}</Text>
              <Text style={styles.detailLabel}>{t("passportView.nationality")}</Text>
              <Text style={styles.detailValue}>{getDisplayValue(nationality)}</Text>

              <View style={styles.detailRowDouble}>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>{t("passportView.dateOfBirth")}</Text>
                  <Text style={styles.detailValue}>
                    {getDisplayValue(formatDateDisplay(passport.dateOfBirth))}
                  </Text>
                </View>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>{t("passportView.gender")}</Text>
                  <Text style={styles.detailValue}>{getDisplayValue(gender, 3)}</Text>
                </View>
              </View>

              <View style={styles.detailRowDouble}>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>{t("passportView.passportNumber")}</Text>
                  <Text style={styles.detailValue}>{getDisplayValue(passport.passportNumber)}</Text>
                </View>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>{t("passportView.passportExpiry")}</Text>
                  <Text style={styles.detailValue}>
                    {getDisplayValue(formatDateDisplay(passport.passportExpiry))}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>
        {isUnsupported && !isExpired && (
          <View style={styles.unsupportedMessageContainer}>
            <RedAlert />
            <Text style={styles.unsupportedMessageText}>
              {t("passportView.unsupportedMessage")}
            </Text>
          </View>
        )}
        {isExpired && (
          <View style={styles.unsupportedMessageContainer}>
            <RedAlert />
            <Text style={styles.unsupportedMessageText}>{t("passportView.expiredMessage")}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  cardContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: SCREEN_WIDTH,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    // It will be hard to maintain the exact ratio while fitting everything on all resolutions,
    // so better deviate from it slightly if necessary.
    // height: CARD_HEIGHT,
    overflow: "hidden",
    borderRadius: 8,
  },
  cardWrapperError: {
    borderColor: "#E6657E",
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "#E6657E",
  },
  idCard: {
    position: "relative",
    backgroundColor: "#F6D38F",
  },
  idCardImage: {
    opacity: 0.5,
  },
  unsupportedMessageContainer: {
    backgroundColor: "#E6657E",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  unsupportedMessageText: {
    color: "#F8F8F8",
    fontSize: 12,
    // fontFamily: "Inter",
    fontWeight: "500",
    flex: 1,
    lineHeight: 18,
  },
  cardHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconText: {
    fontSize: 16,
  },
  cardType: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    // fontFamily: "Inter",
  },
  countryContainer: {},
  cardBody: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  photoContainer: {
    alignItems: "center",
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#D0D0D0",
    marginBottom: 12,
    marginTop: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
    transform: [{ scale: Platform.OS === "ios" ? 1.03 : 1.06 }],
  },
  genuineBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  genuineText: {
    color: "black",
    fontSize: 8,
    fontWeight: "500",
    // fontFamily: "Inter",
  },
  detailsContainer: {
    flex: 1,
  },
  detailRowDouble: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  detailColumn: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 8,
    color: "#765921",
    // fontFamily: "Inter",
    fontWeight: "500",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: "black",
    // fontFamily: "Inter",
    fontWeight: "600",
    marginBottom: 8,
  },
})
