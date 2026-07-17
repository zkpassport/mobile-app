import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { InformationCircleIcon } from "@/assets/images/icons/InformationCircleIcon"
import { Trans } from "react-i18next"

interface InfoFrameProps {
  textKey: string
}

const InfoFrame: React.FC<InfoFrameProps> = ({ textKey }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <InformationCircleIcon width={18} height={18} color="#FBFBFB" />
      </View>
      <Text style={styles.text}>
        <Trans
          i18nKey={textKey}
          components={{
            bold: <Text style={styles.boldText} />,
          }}
        />
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#424D80",
    borderRadius: 6,
    padding: 8,
    alignItems: "flex-start",
    gap: 12,
  },
  iconContainer: {
    paddingTop: 7,
    paddingLeft: 2,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    paddingVertical: 6,
    // fontFamily: "Inter",
    fontWeight: "400",
  },
  boldText: {
    color: "white",
    fontWeight: "700",
    // fontFamily: "Inter",
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 6,
  },
  normalText: {
    color: "white",
    fontWeight: "400",
    paddingVertical: 4,
  },
})

export default InfoFrame
