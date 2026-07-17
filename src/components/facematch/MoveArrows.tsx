// import React from "react"
// import { Image, StyleSheet, Animated, View } from "react-native"
// import { LivenessTargetState } from "@/services/facematch"

// interface MoveArrowsProps {
//   currentTarget: LivenessTargetState | null
//   size?: number
// }

// export const MoveArrows: React.FC<MoveArrowsProps> = ({ currentTarget, size = 80 }) => {
//   // Calculate rotation based on the target direction
//   const getRotation = (): number => {
//     if (!currentTarget) return 0

//     const rotations = [0, 90, 180, -90]
//     return rotations[currentTarget.target.order] || 0
//   }

//   // Get padding based on rotation direction
//   const getPadding = () => {
//     if (!currentTarget) return { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 }

//     const order = currentTarget.target.order
//     // order 0 = left, order 1 = up, order 2 = right, order 3 = down
//     switch (order) {
//       case 0: // left
//         return { paddingRight: 50 }
//       case 1: // up
//         return { paddingRight: 50, paddingTop: 36 }
//       case 2: // right
//         return { paddingRight: 40 }
//       case 3: // down
//         return { paddingRight: 50, paddingBottom: 36 }
//       default:
//         return { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 }
//     }
//   }

//   const rotationValue = getRotation()
//   const padding = getPadding()

//   return (
//     <View style={styles.container}>
//       <Animated.View
//         style={[
//           styles.arrowContainer,
//           {
//             width: size,
//             height: size,
//             ...padding,
//             transform: [
//               { translateX: size * 0.25 }, // Move rotation point to the right side
//               { rotate: `${rotationValue}deg` },
//               { translateX: -size * 0.25 }, // Compensate for the translation
//             ],
//           },
//         ]}
//       >
//         <Image
//           source={require("@/assets/images/MoveArrows.png")}
//           style={styles.arrowImage}
//           resizeMode="contain"
//         />
//       </Animated.View>
//     </View>
//   )
// }

// const styles = StyleSheet.create({
//   container: {
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   arrowContainer: {
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   arrowImage: {
//     width: 230,
//   },
// })
