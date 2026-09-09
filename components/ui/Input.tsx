import React, { forwardRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TextInputProps,
} from "react-native";
import { useTheme } from '../../context/ThemeContext';


const Input = forwardRef<TextInput, TextInputProps>(
  (props, ref) => {
    const { colors } = useTheme();

    return (
      <View
        style={[
          styles.container,
          props.multiline && styles.multilineContainer,
          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
        ]}
      >

        <TextInput
          ref={ref}
          
          placeholderTextColor={colors.mutedText}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          {...props}
          style={[styles.input, { color: colors.text }, props.style]}
        />

      </View>
    );

  }
);


export default Input;


const styles = StyleSheet.create({

  container: {
    borderWidth: 1,
    borderRadius: 16,
    height: 55,
    justifyContent: "center",
    paddingHorizontal: 18,
    marginBottom: 18,

    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  multilineContainer: {
    height: 100,
    justifyContent: 'flex-start',
    paddingVertical: 14,
  },


  input: {
    fontSize: 16,
  },

});