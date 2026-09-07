import React, { forwardRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TextInputProps,
} from "react-native";


const Input = forwardRef<TextInput, TextInputProps>(
  (props, ref) => {

    return (
      <View style={styles.container}>

        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor="#94A3B8"
          {...props}
        />

      </View>
    );

  }
);


export default Input;


const styles = StyleSheet.create({

  container: {
    backgroundColor: "#FFFFFF",
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


  input: {
    fontSize: 16,
    color: "#0F172A",
  },

});