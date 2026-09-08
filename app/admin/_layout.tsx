import React, {
useState,
useEffect
} from "react";


import {
View,
StyleSheet,
Dimensions,
Pressable,
Animated
} from "react-native";


import {
Slot
} from "expo-router";


import Sidebar from "../../components/ui/Sidebar";
import Header from "../../components/ui/Header";
import { useTheme } from "../../context/ThemeContext";





export default function AdminLayout(){
const { colors } = useTheme();



const [open,setOpen]=useState(false);


const [drawerAnim]=useState(
new Animated.Value(-300)
);



const [isDesktop,setIsDesktop]=useState(false);






useEffect(()=>{


const checkScreen=()=>{


const width=Dimensions.get("window").width;


setIsDesktop(width > 900);


};



checkScreen();



const subscription = Dimensions.addEventListener(
"change",
checkScreen
);



return()=>{

subscription?.remove();

};


},[]);








useEffect(()=>{


if(isDesktop){


setOpen(true);


Animated.timing(

drawerAnim,

{

toValue:0,

duration:0,

useNativeDriver:true

}

).start();


}


else{


closeDrawer();


}



},[isDesktop]);











const openDrawer=()=>{


setOpen(true);


Animated.timing(

drawerAnim,

{

toValue:0,

duration:250,

useNativeDriver:true

}

).start();


};










const closeDrawer=()=>{


Animated.timing(

drawerAnim,

{

toValue:-300,

duration:250,

useNativeDriver:true

}

).start(()=>{


if(!isDesktop){

setOpen(false);

}


});


};









return(


<View style={[styles.container, { backgroundColor: colors.background }]}>


{
open && !isDesktop &&

<Pressable

style={[styles.overlay, { backgroundColor: colors.overlay }]}

onPress={closeDrawer}

/>

}





{
(open || isDesktop) &&


<Animated.View

style={[

styles.drawer,
{ backgroundColor: colors.card },

{

transform:[

{

translateX:drawerAnim

}

]

}

]

}

>


<Sidebar

closeDrawer={closeDrawer}

/>


</Animated.View>


}





<View style={styles.content}>


<Header

onMenuPress={openDrawer}

/>



<Slot/>


</View>





</View>


);

}









const styles=StyleSheet.create({



container:{


flex:1,

backgroundColor:"#F8FAFC",


},






drawer:{


position:"absolute",

left:0,

top:0,

bottom:0,

width:260,

backgroundColor:"#FFFFFF",

zIndex:20,


shadowColor:"#000",

shadowOpacity:0.15,

shadowRadius:12,

elevation:12,


paddingTop:35,


},






overlay:{


position:"absolute",

top:0,

left:0,

right:0,

bottom:0,

backgroundColor:"rgba(15,23,42,0.45)",

zIndex:10,


},






content:{


flex:1,


},



});