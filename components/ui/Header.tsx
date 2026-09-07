import React from "react";

import {
View,
Text,
Pressable,
StyleSheet
} from "react-native";


import { router } from "expo-router";
import { useAuth } from "../../hooks/useAuth";

type Props = {
onMenuPress:()=>void;
};


export default function Header({onMenuPress}:Props){
const { user } = useAuth();

return(

<View style={styles.container}>


<Pressable
onPress={onMenuPress}
style={styles.menuButton}
>

<Text style={styles.menuIcon}>
☰
</Text>

</Pressable>



<View style={{ flex: 1 }}>

<Text style={styles.title}>
InterviewPulse
</Text>


<Text style={styles.subtitle}>
Admin Panel
</Text>

</View>

<Pressable
  style={styles.profileButton}
  onPress={() => router.push('/admin/profile')}
  hitSlop={8}
>
  <Text style={styles.profileButtonText}>
    {user?.name?.charAt(0).toUpperCase() || 'A'}
  </Text>
</Pressable>

</View>

);

}



const styles=StyleSheet.create({


container:{

height:100,

backgroundColor:"#FFFFFF",

flexDirection:"row",

alignItems:"center",

paddingHorizontal:20,

borderBottomWidth:1,

borderColor:"#E2E8F0",

},



menuButton:{

height:42,

width:42,

borderRadius:12,

backgroundColor:"#EFF6FF",

alignItems:"center",

justifyContent:"center",

marginRight:15,

marginTop:20

},



menuIcon:{

fontSize:24,

color:"#2563EB",

fontWeight:"700",

},



title:{

fontSize:20,

fontWeight:"800",

color:"#0F172A",

marginTop:20

},



subtitle:{

fontSize:13,

color:"#64748B",

marginTop:2,

},

profileButton:{
  width: 38,
  height: 38,
  borderRadius: 19,
  backgroundColor: "#2563EB",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 20,
},

profileButtonText:{
  fontSize: 16,
  fontWeight: "800",
  color: "#FFFFFF",
},

});