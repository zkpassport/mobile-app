import React, { useState } from "react"
import { View, Text, StyleSheet } from "react-native"
import { Colors } from "@/constants/Colors"
import { DocumentType } from "@/types/DocumentInfo"
import { PassportIcon } from "@/assets/images/icons/PassportIcon"
import { IDCardIcon } from "@/assets/images/icons/IDCardIcon"
import { ResidencePermitIcon } from "@/assets/images/icons/ResidencePermitIcon"
import { BackButton } from "@/components/ui/Buttons"
import { IDTypeCard } from "@/components/ui/Cards"
import { CheckPassportModal } from "../Modals"
import { OUTER_CONTAINER_TOP_PADDING } from "@/lib/constants"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"

interface IDTypeOption {
  id: DocumentType
  titleKey: string
  descriptionKey: string
  Icon: (props: { width?: number; height?: number }) => React.JSX.Element
}

interface ChooseIDTypeViewProps {
  onBack: () => void
  onSelectIDType: (idType: DocumentType) => void
}

type ViewState = "list" | "check-modal" | "get-ready"

const ID_TYPES: IDTypeOption[] = [
  {
    id: DocumentType.PASSPORT,
    titleKey: "scanning.chooseIDType.passport.title",
    descriptionKey: "scanning.chooseIDType.passport.description",
    Icon: (props) => <PassportIcon width={24} height={24} {...props} />,
  },
  {
    id: DocumentType.ID_CARD,
    titleKey: "scanning.chooseIDType.idCard.title",
    descriptionKey: "scanning.chooseIDType.idCard.description",
    Icon: (props) => <IDCardIcon width={24} height={24} {...props} />,
  },
  {
    id: DocumentType.RESIDENCE_PERMIT,
    titleKey: "scanning.chooseIDType.residencePermit.title",
    descriptionKey: "scanning.chooseIDType.residencePermit.description",
    Icon: (props) => <ResidencePermitIcon width={24} height={24} {...props} />,
  },
]

export const ChooseIDTypeView: React.FC<ChooseIDTypeViewProps> = ({ onBack, onSelectIDType }) => {
  const { t } = useTranslation()
  const [view, setView] = useState<ViewState>("list")
  const [selectedIDType, setSelectedIDType] = useState<DocumentType | null>(null)
  const insets = useSafeAreaInsets()

  const handleSelect = (idType: DocumentType) => {
    setSelectedIDType(idType)
    setView("check-modal")
  }

  const handleConfirm = () => {
    if (selectedIDType) {
      onSelectIDType(selectedIDType)
    }
  }

  const handleDecline = () => {
    // If user doesn't have an NFC-capable document, you can route elsewhere here.
    // For now, just dismiss modal and let them choose again.
    setView("list")
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.container}>
        <View style={styles.backButton}>
          <BackButton onPress={onBack} text={t("scanning.back")} />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{t("scanning.chooseIDType.title")}</Text>

          <View style={styles.optionsContainer}>
            {ID_TYPES.map((idType) => (
              <IDTypeCard
                key={idType?.id}
                title={t(idType?.titleKey ?? "")}
                description={t(idType?.descriptionKey ?? "")}
                icon={<idType.Icon />}
                onPress={() => handleSelect(idType?.id ?? DocumentType.PASSPORT)}
              />
            ))}
          </View>
        </View>

        <CheckPassportModal
          visible={view === "check-modal"}
          onClose={() => setView("list")}
          onConfirm={handleConfirm}
          onDecline={handleDecline}
          idType={selectedIDType as DocumentType}
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
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  backButton: {
    paddingVertical: 16,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FBFBFB",
    marginBottom: 24,
    marginTop: 30,
    // fontFamily: "Inter",
    lineHeight: 32,
  },
  optionsContainer: {
    gap: 16,
  },
})
