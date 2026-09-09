import React from "react";

import {
View,
Text,
Pressable,
StyleSheet
} from "react-native";


import { router } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../context/ThemeContext";
import { ThemeColors } from "../../theme/colors";
import { ROUTES } from "../../constants/routes";

type Props = {
onMenuPress:()=>void;
};


export default function Header({onMenuPress}:Props){
const { user } = useAuth();
const { colors } = useTheme();
const styles = createStyles(colors);

return(

<View style={[styles.container, { backgroundColor: colors.headerBackground, borderColor: colors.headerBorder }]}>


<Pressable
onPress={onMenuPress}
style={styles.menuButton}
>

<Text style={[styles.menuIcon, { color: colors.primary }]}>
☰
</Text>

</Pressable>



<View style={{ flex: 1 }}>

<Text style={[styles.title, { color: colors.text }]}>
InterviewPulse
</Text>


<Text style={[styles.subtitle, { color: colors.secondaryText }]}>
Admin Panel
</Text>

</View>

<Pressable
  style={styles.profileButton}
  onPress={() => router.push(ROUTES.adminProfile)}
  hitSlop={8}
>
  <Text style={styles.profileButtonText}>
    {user?.name?.charAt(0).toUpperCase() || 'A'}
  </Text>
</Pressable>

</View>

);

}



const createStyles = (colors: ThemeColors) => StyleSheet.create({


container:{

height:100,

backgroundColor:colors.headerBackground,

flexDirection:"row",

alignItems:"center",

paddingHorizontal:20,

borderBottomWidth:1,

borderColor:colors.cardBorder,

},



menuButton:{

height:42,

width:42,

borderRadius:12,

backgroundColor: colors.primaryLight,

alignItems:"center",

justifyContent:"center",

marginRight:15,

marginTop:20

},



menuIcon:{

fontSize:24,

color: colors.primary,

fontWeight:"700",

},



title:{

fontSize:20,

fontWeight:"800",

color:colors.text,

marginTop:20

},



subtitle:{

fontSize:13,

color:colors.secondaryText,

marginTop:2,

},

profileButton:{
  width: 38,
  height: 38,
  borderRadius: 19,
  backgroundColor: colors.primary,
  alignItems: "center",
  justifyContent: "center",
  marginTop: 20,
},

profileButtonText:{
  fontSize: 16,
  fontWeight: "800",
  color: colors.text,
},

});