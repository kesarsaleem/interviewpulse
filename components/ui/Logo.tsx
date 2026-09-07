import React from "react";
import { Image, StyleSheet, View } from "react-native";


export default function Logo() {

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );

}


const styles = StyleSheet.create({

  container:{
    alignItems:"center",
    justifyContent:"center",
  },


  logo:{
    width:260,
    height:180,
  }

});