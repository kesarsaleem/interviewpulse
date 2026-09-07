import React, {
  useEffect,
  useRef,
} from "react";

import {
  Text,
  StyleSheet,
  Animated,
} from "react-native";

import { router } from "expo-router";

import { useAuth } from "../hooks/useAuth";

import Logo from "../components/ui/Logo";
import GradientBackground from "../components/ui/GradientBackground";
import { ROUTES } from "../constants/routes";



export default function SplashScreen() {


  const { user, loading } = useAuth();



  const fadeAnim = useRef(
    new Animated.Value(0)
  ).current;


  const scaleAnim = useRef(
    new Animated.Value(0.8)
  ).current;



  useEffect(() => {


    Animated.parallel([


      Animated.timing(
        fadeAnim,
        {
          toValue:1,
          duration:1200,
          useNativeDriver:true,
        }
      ),



      Animated.spring(
        scaleAnim,
        {
          toValue:1,
          friction:5,
          useNativeDriver:true,
        }
      )


    ]).start();



  },[]);





  useEffect(()=>{


    if(loading) return;



    const timer = setTimeout(()=>{


      if(user){


        if(user.role === "admin"){


          router.replace(ROUTES.adminDashboard);


        }else{


          router.replace(ROUTES.interviewerHome);


        }


      }else{


        router.replace(ROUTES.login);


      }



    },2000);



    return ()=>clearTimeout(timer);



  },[user, loading]);





  return (

    <GradientBackground>


      <Animated.View

        style={[
          styles.logo,

          {

            opacity:fadeAnim,

            transform:[
              {
                scale:scaleAnim
              }
            ]

          }

        ]}

      >

        <Logo />

      </Animated.View>



      <Text style={styles.loading}>
        Loading...
      </Text>



    </GradientBackground>

  );

}





const styles = StyleSheet.create({


  logo:{
    marginBottom:20,
  },


  loading:{
    marginTop:50,
    color:"#FFFFFF",
    fontSize:14,
  }


});