import React, { useState, useMemo } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from "react-native"
import { Colors } from "@/constants/Colors"
import { ModalWrapper } from "./ModalWrapper"
import { useSettings } from "@/context/SettingsContext"
import { PassportFilterItem } from "../History/PassportFilterItem"
import { PrimaryButton } from "@/components/ui/Buttons"
import { useModalSwipeDown } from "@/hooks/useModalSwipeDown"
import { LinearGrad } from "../ui/Text/LinearGradient"
import { useTranslation } from "react-i18next"
import { ModalHandle } from "../ui/ModalHandle"

export type FilterOptions = {
  selectedPassportIds: string[]
  verificationStatuses: ("Passed" | "Not Passed")[]
}

interface HistoryFilterModalProps {
  visible: boolean
  onClose: () => void
  onApply: (filters: FilterOptions) => void
  currentFilters: FilterOptions
}

export const HistoryFilterModal: React.FC<HistoryFilterModalProps> = ({
  visible,
  onClose,
  onApply,
  currentFilters,
}) => {
  const { t } = useTranslation()
  const { settings, passports } = useSettings()
  const [selectedPassportIds, setSelectedPassportIds] = useState<string[]>(
    currentFilters.selectedPassportIds,
  )
  const [selectedStatuses, setSelectedStatuses] = useState<("Passed" | "Not Passed")[]>(
    currentFilters.verificationStatuses,
  )

  const { panResponder, translateY } = useModalSwipeDown(onClose, 100, visible)

  const handleReset = () => {
    setSelectedPassportIds([])
    setSelectedStatuses([])
  }

  const handleApply = () => {
    onApply({
      selectedPassportIds,
      verificationStatuses: selectedStatuses,
    })
    onClose()
  }

  const totalFiltersSelected = selectedPassportIds.length + selectedStatuses.length

  const togglePassportId = (id: string) => {
    setSelectedPassportIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id],
    )
  }

  // Build list of all passports that have history entries
  // This includes both existing passports and deleted ones (from history metadata)
  const allFilterablePassports = useMemo(() => {
    const result: {
      id: string
      passport?: (typeof passports)[string]
      metadata?: { name: string; countryCode: string; idType: string }
    }[] = []

    for (const passportId in passports) {
      const passport = passports[passportId]
      if (passport) {
        result.push({
          id: passportId,
          passport: passport,
        })
      }
    }

    return result
  }, [settings, passports])

  return (
    <ModalWrapper
      transparent={true}
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[
            styles.modalWrapper,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.container}>
            <View {...panResponder.panHandlers}>
              <ModalHandle />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft} />
              <Text style={styles.title}>{t("modals.historyFilter.title")}</Text>
              <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
                <LinearGrad
                  text={t("modals.historyFilter.resetAll")}
                  colors={["#F2DCB0", "#F6D38F"]}
                  textStyle={styles.resetText}
                />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Selected ID Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("modals.historyFilter.selectedID")}</Text>
                <View style={styles.passportList}>
                  {allFilterablePassports.length === 0 ? (
                    <View style={styles.noPassports}>
                      <Text style={styles.noPassportsText}>
                        {t("modals.historyFilter.noIDsFound")}
                      </Text>
                    </View>
                  ) : (
                    allFilterablePassports.map((item) => {
                      const isSelected = selectedPassportIds.includes(item.id)

                      return (
                        <PassportFilterItem
                          key={item.id}
                          passport={item.passport}
                          isSelected={isSelected}
                          onToggle={() => togglePassportId(item.id)}
                          nameH={item.metadata?.name}
                          countryCodeH={item.metadata?.countryCode}
                          idTypeH={item.metadata?.idType}
                        />
                      )
                    })
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <PrimaryButton
                text={t("modals.historyFilter.cancel")}
                onPress={onClose}
                primary={false}
              />
              <PrimaryButton
                text={
                  totalFiltersSelected > 0
                    ? t("modals.historyFilter.apply_other", { count: totalFiltersSelected })
                    : t("modals.historyFilter.apply_zero")
                }
                onPress={handleApply}
                primary={true}
              />
            </View>
          </View>
        </Animated.View>
      </View>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalWrapper: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  noPassports: {
    paddingVertical: 12,
  },
  noPassportsText: {
    fontSize: 16,
    fontWeight: "400",
    color: "#FBFBFB",
  },
  container: {
    backgroundColor: Colors.dark.background,
    paddingBottom: 48,
    paddingHorizontal: 16,
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingVertical: 12,
    paddingTop: 12,
  },
  dragHandle: {
    width: 80,
    height: 5,
    borderRadius: 100,
    backgroundColor: Colors.dark.tint,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 32,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    textAlign: "center",
    flex: 1,
  },
  resetButton: {
    flex: 1,
    alignItems: "flex-end",
  },
  resetText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#F6D38F",
    // fontFamily: "Inter",
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollContent: {},
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    marginBottom: 16,
    lineHeight: 24,
  },
  passportList: {
    gap: 16,
  },
  statusRow: {
    flexDirection: "row",
    gap: 16,
  },
  buttonContainer: {
    gap: 24,
    paddingTop: 12,
  },
  cancelButton: {
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F2DCB0",
  },
  cancelButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#F6D38F",
    // fontFamily: "Inter",
  },
  applyButton: {
    borderRadius: 999,
    overflow: "hidden",
  },
  applyButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#030303",
    // fontFamily: "Inter",
  },
})
