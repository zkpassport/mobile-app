import React from "react"
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useTranslation } from "react-i18next"

type MessageViewProps = {
  setShowModal: (show: boolean) => void
  message: string
  icon: string
  actionButtonName?: string
  actionButtonHandler?: () => void
}

const MessageView: React.FC<MessageViewProps> = ({
  setShowModal,
  message,
  icon,
  actionButtonName,
  actionButtonHandler,
}) => {
  const { t } = useTranslation()
  return (
    <LinearGradient
      colors={["#4624F0", "#241A7F"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.messageContainer}>
          <Image
            source={icon ? { uri: icon } : require("@/assets/images/zkpassport-logo.png")}
            style={styles.icon}
          />
          <Text style={styles.messageText}>{message}</Text>
        </View>

        <View style={styles.buttonContainer}>
          {actionButtonName && actionButtonHandler && (
            <TouchableOpacity
              style={[styles.button, styles.actionButton]}
              onPress={() => {
                actionButtonHandler()
                setShowModal(false)
              }}
            >
              <Text style={styles.buttonText}>{actionButtonName}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.dismissButton]}
            onPress={() => setShowModal(false)}
          >
            <Text style={styles.buttonText}>{t("dismiss")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    padding: 25,
  },
  messageContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 35,
    marginBottom: 20,
  },
  icon: {
    width: 60,
    height: 60,
    marginRight: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 24,
  },
  buttonContainer: {
    marginTop: "auto",
    paddingBottom: 30,
  },
  button: {
    borderRadius: 25,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  actionButton: {
    backgroundColor: "gray",
  },
  dismissButton: {
    backgroundColor: "#6F66FF",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
  },
})

export default MessageView
