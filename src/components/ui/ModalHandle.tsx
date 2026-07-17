import { View, StyleSheet } from "react-native"

export const ModalHandle = () => {
  return (
    <View style={styles.handleContainer}>
      <View style={styles.handle} />
    </View>
  )
}

const styles = StyleSheet.create({
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 80,
    height: 5,
    backgroundColor: "#7483C7",
    borderRadius: 100,
  },
})
