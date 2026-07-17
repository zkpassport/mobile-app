import { StyleProp, TextStyle, ViewStyle, Text } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import MaskedView from "@react-native-masked-view/masked-view"

interface LinearGradProps {
  text: string | React.ReactNode
  colors: string[]
  textStyle?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
}

export const LinearGrad = (props: LinearGradProps) => {
  return (
    <MaskedView
      style={props.containerStyle}
      maskElement={<Text style={props.textStyle}>{props.text}</Text>}
    >
      <LinearGradient
        colors={[props.colors[0], props.colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <Text style={[props.textStyle, { opacity: 0 }]}>{props.text}</Text>
      </LinearGradient>
    </MaskedView>
  )
}
