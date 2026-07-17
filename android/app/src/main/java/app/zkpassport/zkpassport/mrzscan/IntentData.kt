package app.zkpassport.zkpassport.mrzscan

object IntentData {

    const val KEY_MRZ = "KEY_MRZ"
    const val KEY_PASSPORT = "KEY_PASSPORT"
    const val KEY_IMAGE = "KEY_IMAGE"
    const val KEY_CONFIDENCE = "KEY_CONFIDENCE"
    const val KEY_DOCUMENT_TYPE = "KEY_DOCUMENT_TYPE"
    const val KEY_TIMEOUT = "KEY_TIMEOUT"

    // Result codes
    const val RESULT_CODE_TIMEOUT = 100

    @JvmStatic
    fun getKeyMrz(): String = KEY_MRZ
}