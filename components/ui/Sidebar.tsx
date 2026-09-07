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
import { ROUTES } from "../../constants/routes";


export default function Sidebar({
closeDrawer
}:{
closeDrawer?:()=>void
}){

const { user } = useAuth();
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

          router.replace(ROUTES.login);
        },
      },
    ]
  );
};







const MenuItem=({item}:any)=>{


const active = pathname === item.route;



return(


<Pressable

onPress={()=>navigate(item.route)}

style={[

styles.menuItem,

active && styles.activeMenu

]}

>



<View style={styles.iconBox}>

<Text style={[

styles.icon,

active && styles.activeIcon

]}>

{item.icon}

</Text>

</View>





<Text style={[

styles.menuText,

active && styles.activeText

]}>

{item.title}

</Text>




{
item.badge &&

<View style={styles.badge}>

<Text style={styles.badgeText}>
{item.badge}
</Text>

</View>

}




</Pressable>


);


};









return(


<View style={styles.container}>



{/* TOP PROFILE HEADER */}


<Pressable
  style={styles.profileArea}
  onPress={() => navigate('/admin/profile')}
>
  <Pressable
    style={styles.closeButton}
    onPress={closeDrawer}
  >
    <Text style={styles.closeText}>×</Text>
  </Pressable>

  <View style={styles.avatar}>
    <Text style={styles.avatarText}>
      {user?.name?.charAt(0).toUpperCase() || 'A'}
    </Text>
  </View>

  <Text style={styles.adminName}>
    {user?.name || 'Administrator'}
  </Text>

  <Text style={styles.email}>
    {user?.email || 'admin@interviewpulse.com'}
  </Text>

  <View style={styles.roleBadge}>
    <Text style={styles.roleText}>
      {user?.role === 'admin' ? 'Administrator' : 'Admin Operations'}
    </Text>
  </View>
</Pressable>







<ScrollView

showsVerticalScrollIndicator={false}

contentContainerStyle={styles.menuContainer}

>




<Text style={styles.section}>
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







<Text style={styles.section}>
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

style={styles.logout}

onPress={logout}

>


<Text style={styles.logoutIcon}>
⇥
</Text>


<Text style={styles.logoutText}>
Logout
</Text>


</Pressable>





</ScrollView>



</View>


);


}









const styles=StyleSheet.create({




container:{


flex:1,

backgroundColor:"#FFFFFF",

},






profileArea:{


backgroundColor:"#06245B",

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

color:"#CBD5E1",

},







avatar:{


height:52,

width:52,

borderRadius:26,

backgroundColor:"#2563EB",

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

color:"#CBD5E1",

marginTop:5,


},







roleBadge:{


backgroundColor:"#0B5ED7",

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

color:"#94A3B8",

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


backgroundColor:"#EFF6FF",


},







iconBox:{


width:40,


},






icon:{


fontSize:21,

color:"#64748B",

},






activeIcon:{


color:"#2563EB",

},







menuText:{


fontSize:15,

fontWeight:"600",

color:"#334155",

flex:1,


},







activeText:{


color:"#2563EB",

fontWeight:"800",


},







badge:{


height:22,

width:22,

borderRadius:11,

backgroundColor:"#2563EB",

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

backgroundColor:"#FEF2F2",

flexDirection:"row",

alignItems:"center",

justifyContent:"center",

marginTop:20,


},






logoutIcon:{


fontSize:20,

color:"#EF4444",

marginRight:10,


},






logoutText:{


fontSize:16,

fontWeight:"800",

color:"#EF4444",

},



});