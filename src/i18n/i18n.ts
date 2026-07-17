import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import * as Localization from "expo-localization"

import en from "./locales/en.json"
import fr from "./locales/fr.json"
import pt from "./locales/pt.json"

const resources = {
  en: {
    translation: en,
  },
  fr: {
    translation: fr,
  },
  pt: {
    translation: pt,
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: Localization.getLocales()[0].languageTag, // Use device language, fallback to 'en' if not supported
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  compatibilityJSON: "v4",
})

export default i18n
