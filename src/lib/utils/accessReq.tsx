import { DisclosureCircuitName } from "@zkpassport/utils"
import { t } from "i18next"

export const getLoadingText = (circuitName: DisclosureCircuitName) => {
  switch (circuitName) {
    case "bind":
    case "bind_evm":
      return t("accessRequest.verifyingBind")
    case "compare_age":
    case "compare_age_evm":
      return t("accessRequest.verifyingAge")
    case "compare_birthdate":
    case "compare_birthdate_evm":
      return t("accessRequest.verifyingBirthdate")
    case "disclose_bytes":
    case "disclose_bytes_evm":
      return t("accessRequest.verifyingDisclose")
    case "exclusion_check_issuing_country":
    case "exclusion_check_issuing_country_evm":
      return t("accessRequest.verifyingExclusionIssuingCountry")
    case "exclusion_check_nationality":
    case "exclusion_check_nationality_evm":
      return t("accessRequest.verifyingExclusionNationality")
    case "inclusion_check_issuing_country":
    case "inclusion_check_issuing_country_evm":
      return t("accessRequest.verifyingInclusionIssuingCountry")
    case "inclusion_check_nationality":
    case "inclusion_check_nationality_evm":
      return t("accessRequest.verifyingInclusionNationality")
    case "exclusion_check_sanctions":
    case "exclusion_check_sanctions_evm":
      return t("accessRequest.verifyingExclusionSanctions")
    case "facematch":
    case "facematch_evm":
      return t("accessRequest.verifyingFaceMatch")
  }
  return t("accessRequest.verifying")
}

// Format time for display
export const getFormattedTime = () => {
  const now = new Date()
  return now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}
