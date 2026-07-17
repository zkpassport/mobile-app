import { View, StyleSheet } from "react-native"

export const PaginationButtons = ({ page }: { page: number }) => {
  return (
    <View style={styles.paginationContainer}>
      <View style={[styles.dot, page === 0 && styles.dotActive]} />
      <View style={[styles.dot, page === 1 && styles.dotActive]} />
      <View style={[styles.dot, page === 2 && styles.dotActive]} />
    </View>
  )
}

const styles = StyleSheet.create({
  paginationContainer: {
    flexDirection: "row",
    gap: 24,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F6D38F",
    opacity: 0.3,
  },
  dotActive: {
    backgroundColor: "#F6D38F",
    opacity: 1,
  },
})
