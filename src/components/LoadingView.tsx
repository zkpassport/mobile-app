import React, { useEffect, useRef } from "react"
import { View, Text, Image, StyleSheet, Dimensions } from "react-native"
import LottieView from "lottie-react-native"
// c.f. https://lottiefiles.com/free-animation/nfc-scan-TGyYTomcRU
import lottieAnimation from "@/assets/animations/nfc-reading.json"
import { useTranslation } from "react-i18next"
import { useHideTabBar } from "@/context/TabBarVisibilityContext"

const LoadingView = ({
  loaded,
  onHide,
  secondaryText,
}: {
  loaded: boolean
  onHide: () => void
  secondaryText?: string
}) => {
  const animation = useRef<LottieView>(null)
  const { t } = useTranslation()
  useHideTabBar(true)
  useEffect(() => {
    if (!loaded) {
      animation.current?.play(150, 210)
    } else if (loaded) {
      animation.current?.play(210, 391)
      setTimeout(() => {
        onHide()
      }, 2000)
    }
  }, [animation, loaded])

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/zkpassport-app-home-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>{t("home.loadingPassport")}</Text>
        {secondaryText && <Text style={styles.secondaryText}>{secondaryText}</Text>}
        <LottieView ref={animation} source={lottieAnimation} loop={!loaded} style={styles.loader} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    marginBottom: 15,
    // fontFamily: "Metropolis",
  },
  logo: {
    width: Dimensions.get("window").width * 0.7,
    maxHeight: 300,
    height: 100,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 20,
    maxWidth: 280,
    lineHeight: 28,
    paddingHorizontal: 20,
    // fontFamily: "Metropolis",
  },
  loader: {
    width: 150,
    height: 150,
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: "auto",
  },
  secondaryText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    marginTop: -10,
    marginBottom: 20,
    maxWidth: 300,
    lineHeight: 22,
    paddingHorizontal: 30,
    // fontFamily: "Metropolis",
  },
})

export default LoadingView
