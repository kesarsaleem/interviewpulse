import React from "react";

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import {
router,
usePathname
} from "expo-router";

import {
supabase
} from "../../lib/supabase/client";

import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../context/ThemeContext";
import { ThemeColors } from "../../theme/colors";

export default function Sidebar({
closeDrawer
}:{
closeDrawer?:()=>void
}){

const { user } = useAuth();
const { colors } = useTheme();
const styles = createStyles(colors);
const pathname = usePathname();




const mainMenu=[


{
title:"Dashboard",
icon:"⌂",
route:"/admin/dashboard"
},


{
title:"Jobs",
icon:"▣",
route:"/admin/jobs"
},


{
title:"Candidates",
icon:"♙",
route:"/admin/candidates"
},


{
title:"Interviewers",
icon:"♧",
route:"/admin/interviewers"
},


{
title:"Interviews",
icon:"▤",
route:"/admin/interviews"
},


{
title:"Compare",
icon:"⇄",
route:"/admin/compare"
},


{
title:"Reports & Analytics",
icon:"▥",
route:"/admin/reports"
},


];





const settingsMenu=[


{
title:"Notifications",
icon:"♧",
route:"/admin/notifications",
badge:"3"
},


{
title:"Settings",
icon:"⚙",
route:"/admin/settings"
},


{
title:"Profile",
icon:"◉",
route:"/admin/profile"
},


];







const navigate=(route:string)=>{


router.push(route as any);


if(closeDrawer){

closeDrawer();

}


};







const logout = () => {
  Alert.alert(
    "Logout",
    "Are you sure you want to logout?",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();

          if (closeDrawer) {
            closeDrawer();
          }

        },
      },
    ]
  );
};







const MenuItem=({item}:any)=>{
const { colors } = useTheme();


const active = pathname === item.route;



return(


<Pressable

onPress={()=>navigate(item.route)}

style={[

styles.menuItem,

{ backgroundColor: active ? colors.primaryLight : 'transparent' }

]}

>



<View style={styles.iconBox}>

<Text style={[

styles.icon,

{ color: active ? colors.primary : colors.secondaryText }

]}>

{item.icon}

</Text>

</View>





<Text style={[

styles.menuText,

{ color: active ? colors.primary : colors.secondaryText }

]}>

{item.title}

</Text>




{
item.badge &&

<View style={[styles.badge, { backgroundColor: colors.primary }]}>

<Text style={styles.badgeText}>
{item.badge}
</Text>

</View>

}




</Pressable>


);


};









return(


<View style={[styles.container, { backgroundColor: colors.card }]}>



{/* TOP PROFILE HEADER */}


<Pressable
  style={[styles.profileArea, { backgroundColor: colors.primaryDark }]}
  onPress={() => navigate('/admin/profile')}
>
  <Pressable
    style={styles.closeButton}
    onPress={closeDrawer}
  >
    <Text style={[styles.closeText, { color: colors.secondaryText }]}>×</Text>
  </Pressable>

  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
    <Text style={styles.avatarText}>
      {user?.name?.charAt(0).toUpperCase() || 'A'}
    </Text>
  </View>

  <Text style={styles.adminName}>
    {user?.name || 'Administrator'}
  </Text>

  <Text style={[styles.email, { color: colors.secondaryText }]}>
    {user?.email || 'admin@interviewpulse.com'}
  </Text>

  <View style={[styles.roleBadge, { backgroundColor: colors.primary }]}>
    <Text style={styles.roleText}>
      {user?.role === 'admin' ? 'Administrator' : 'Admin Operations'}
    </Text>
  </View>
</Pressable>







<ScrollView

showsVerticalScrollIndicator={false}

contentContainerStyle={styles.menuContainer}

>




<Text style={[styles.section, { color: colors.mutedText }]}>
MAIN
</Text>



{
mainMenu.map((item)=>(

<MenuItem

key={item.route}

item={item}

/>

))
}







<Text style={[styles.section, { color: colors.mutedText }]}>
SETTINGS
</Text>



{
settingsMenu.map((item)=>(

<MenuItem

key={item.route}

item={item}

/>

))
}





<Pressable

style={[styles.logout, { backgroundColor: colors.dangerLight }]}

onPress={logout}

>


<Text style={[styles.logoutIcon, { color: colors.danger }]}>
⇥
</Text>


<Text style={[styles.logoutText, { color: colors.danger }]}>
Logout
</Text>


</Pressable>





</ScrollView>



</View>


);


}









const createStyles = (colors: ThemeColors) => StyleSheet.create({




container:{


flex:1,

backgroundColor:colors.card,

},






profileArea:{


backgroundColor:colors.primaryDark,

paddingTop:45,

paddingBottom:25,

paddingHorizontal:20,


},







closeButton:{


position:"absolute",

right:18,

top:18,


},





closeText:{


fontSize:28,

fontWeight:"300",

color:colors.inputBorder,

},







avatar:{


height:52,

width:52,

borderRadius:26,

backgroundColor: colors.primary,

alignItems:"center",

justifyContent:"center",

marginBottom:12,


},






avatarText:{


fontSize:25,

},







adminName:{


fontSize:16,

fontWeight:"800",

color:"#FFFFFF",

},





email:{


fontSize:12,

color:colors.inputBorder,

marginTop:5,


},







roleBadge:{


backgroundColor:colors.primary,

paddingHorizontal:10,

paddingVertical:4,

borderRadius:12,

marginTop:8,

alignSelf:"flex-start",


},







roleText:{


fontSize:10,

fontWeight:"700",

color:"#FFFFFF",


},







menuContainer:{


paddingHorizontal:18,

paddingTop:15,

paddingBottom:20,


},






section:{


fontSize:12,

fontWeight:"800",

letterSpacing:1,

color:colors.mutedText,

marginTop:18,

marginBottom:12,


},







menuItem:{


height:52,

borderRadius:12,

flexDirection:"row",

alignItems:"center",

paddingHorizontal:12,

marginBottom:6,


},







activeMenu:{


backgroundColor: colors.primaryLight,


},







iconBox:{


width:40,


},






icon:{


fontSize:21,

color:colors.secondaryText,

},






activeIcon:{


color: colors.primary,

},







menuText:{


fontSize:15,

fontWeight:"600",

color:colors.secondaryText,

flex:1,


},







activeText:{


color: colors.primary,

fontWeight:"800",


},







badge:{


height:22,

width:22,

borderRadius:11,

backgroundColor: colors.primary,

alignItems:"center",

justifyContent:"center",

},






badgeText:{


color:"#FFFFFF",

fontSize:12,

fontWeight:"800",

},







logout:{


height:55,

borderRadius:15,

backgroundColor:colors.dangerLight,

flexDirection:"row",

alignItems:"center",

justifyContent:"center",

marginTop:20,


},






logoutIcon:{


fontSize:20,

color:colors.danger,

marginRight:10,


},






logoutText:{


fontSize:16,

fontWeight:"800",

color:colors.danger,

},



});