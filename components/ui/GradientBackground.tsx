import React from "react";
import {
  View,
  StyleSheet,
} from "react-native";
import { useTheme } from '../../context/ThemeContext';


export default function GradientBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (

    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Top dark blue circle */}
      <View style={styles.circleTop} />

      {/* Right light circle */}
      <View style={[styles.circleRight, { backgroundColor: colors.primaryLight }]} />

      {/* Bottom blue circle */}
      <View style={[styles.circleBottom, { backgroundColor: colors.primary }]} />


      <View style={styles.content}>
        {children}
      </View>

    </View>

  );
}


const styles = StyleSheet.create({

  container:{
    flex:1,
    backgroundColor:"#EEF2FF",
    overflow:"hidden",
  },


  content:{
    flex:1,
    justifyContent:"center",
    alignItems:"center",
    zIndex:10,
  },


  circleTop:{
    position:"absolute",
    width:280,
    height:280,
    borderRadius:140,
    backgroundColor:"#1E3A8A",
    top:-120,
    left:-100,
    opacity:0.95,
  },


  circleRight:{
    position:"absolute",
    width:260,
    height:260,
    borderRadius:130,
    backgroundColor:"#93C5FD",
    top:50,
    right:-100,
    opacity:0.7,
  },


  circleBottom:{
    position:"absolute",
    width:350,
    height:350,
    borderRadius:175,
    backgroundColor:"#2563EB",
    bottom:-180,
    left:30,
    opacity:0.8,
  },

});