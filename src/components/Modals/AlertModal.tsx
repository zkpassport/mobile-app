import React from "react"
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageSourcePropType,
  TouchableOpacity,
  Animated,
} from "react-native"
import { PrimaryButton } from "@/components/ui/Buttons"
import { useModalSwipeDown } from "@/hooks/useModalSwipeDown"
import { ModalHandle } from "../ui/ModalHandle"
import { ModalWrapper } from "./ModalWrapper"

interface AlertModalProps {
  visible: boolean
  onClose: () => void
  onAccept: () => void
  icon?: ImageSourcePropType
  iconSize?: number
  title: string
  description: string | React.ReactNode
  disclaimer?: string
  buttonText?: string
  buttonText2?: string
  linkText?: string
  onLinkPress?: () => void
  description2?: boolean
  buttonIcon?: React.ReactNode
}

export const AlertModal: React.FC<AlertModalProps> = ({
  visible,
  onClose,
  onAccept,
  icon,
  iconSize,
  title,
  description,
  disclaimer,
  buttonText,
  buttonText2,
  linkText,
  onLinkPress,
  description2,
  buttonIcon,
}) => {
  const { panResponder, translateY } = useModalSwipeDown(onClose, 100, visible)

  return (
    <ModalWrapper visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.modalContainer, { transform: [{ translateY }] }]}>
          <View {...panResponder.panHandlers}>
            <ModalHandle />
          </View>

          <View style={styles.textContainer}>
            {icon && (
              <Image
                source={icon}
                style={[styles.logo, { width: iconSize, height: iconSize }]}
                resizeMode="contain"
              />
            )}

            <Text style={styles.title}>{title}</Text>

            <Text style={styles.description}>{description}</Text>

            {linkText && onLinkPress && (
              <TouchableOpacity style={styles.linkButton} onPress={onLinkPress}>
                <Text style={styles.linkIcon}>ⓘ</Text>
                <Text style={styles.linkText}>{linkText}</Text>
              </TouchableOpacity>
            )}

            {disclaimer && (
              <Text
                style={[
                  description2 ? styles.description : styles.disclaimer,
                  description2 && { marginBottom: 0 },
                ]}
              >
                {disclaimer}
              </Text>
            )}
          </View>

          {buttonText && (
            <View style={styles.buttonWrapper}>
              <PrimaryButton text={buttonText} onPress={onAccept} primary icon={buttonIcon} />
            </View>
          )}

          {buttonText2 && (
            <View style={styles.buttonWrapper2}>
              <PrimaryButton text={buttonText2} onPress={onClose} primary={false} />
            </View>
          )}
        </Animated.View>
      </View>
    </ModalWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#142262",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingBottom: 48,
    paddingHorizontal: 16,
  },
  textContainer: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 4,
  },
  logo: {
    width: 80,
    height: 80,
    alignSelf: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    color: "#E7E7E7",
    textAlign: "center",
    marginBottom: 12,
    // fontFamily: "Inter",
  },
  description: {
    fontSize: 16,
    color: "#E7E7E7",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 26,
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  disclaimer: {
    fontSize: 12,
    color: "#E7E7E7",
    textAlign: "center",
    lineHeight: 20,
    // fontFamily: "Inter",
    fontWeight: "400",
    opacity: 0.9,
  },
  buttonWrapper: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonWrapper2: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  linkIcon: {
    fontSize: 16,
    color: "#E7E7E7",
    marginRight: 6,
  },
  linkText: {
    fontSize: 14,
    color: "#E7E7E7",
    // fontFamily: "Inter",
    fontWeight: "500",
    textDecorationLine: "underline",
  },
})
