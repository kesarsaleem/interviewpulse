import React, { useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import Logo from "../../components/ui/Logo";
import GradientBackground from "../../components/ui/GradientBackground";

import { useAuth } from "../../hooks/useAuth";


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


export default function ForgotPasswordScreen(){

const { resetPassword } = useAuth();


const [email,setEmail] = useState("");
const [loading,setLoading] = useState(false);

const [error,setError] = useState("");
const [success,setSuccess] = useState("");



const handleReset = async()=>{

setError("");
setSuccess("");


if(!email.trim()){

setError("Email is required");
return;

}


if(!EMAIL_REGEX.test(email.trim())){

setError("Enter a valid email address");
return;

}



try{

setLoading(true);


const {error} = await resetPassword(
email.trim().toLowerCase()
);



if(error){

setError(
typeof error==="string"
?error
:"Unable to send reset email"
);

return;

}



setSuccess(
"Password reset link has been sent to your email."
);



}
catch{

setError(
"Something went wrong. Please try again."
);


}
finally{

setLoading(false);

}


};



return(

<GradientBackground>


<KeyboardAvoidingView

style={styles.container}

behavior={
Platform.OS==="ios"
?"padding"
:undefined
}

>


<ScrollView

contentContainerStyle={styles.scroll}

keyboardShouldPersistTaps="handled"

>


<View style={styles.card}>


<Logo/>


<Text style={styles.title}>
Forgot Password?
</Text>


<Text style={styles.subtitle}>
Enter your email and we will send you a reset link
</Text>



<View style={styles.line}/>



{
error ?

<View style={styles.errorBox}>

<Ionicons
name="alert-circle"
size={20}
color="#DC2626"
/>

<Text style={styles.error}>
{error}
</Text>

</View>

:null
}




{
success ?

<View style={styles.successBox}>

<Ionicons
name="checkmark-circle"
size={20}
color="#16A34A"
/>


<Text style={styles.success}>
{success}
</Text>


</View>

:null
}




<Text style={styles.label}>
Email
</Text>



<TextInput

style={styles.input}

placeholder="Enter your email"

placeholderTextColor="#94A3B8"

value={email}

onChangeText={(v)=>{

setEmail(v);
setError("");
setSuccess("");

}}

keyboardType="email-address"

autoCapitalize="none"

/>




<Pressable

style={[
styles.button,
loading && styles.disabled
]}

disabled={loading}

onPress={handleReset}

>


<Text style={styles.buttonText}>

{
loading
?"Sending..."
:"Send Reset Link"
}

</Text>


</Pressable>




<Pressable

onPress={()=>router.back()}

>

<Text style={styles.back}>
← Back to Login
</Text>


</Pressable>



</View>


</ScrollView>


</KeyboardAvoidingView>


</GradientBackground>


);

}





const styles=StyleSheet.create({

container:{
flex:1,
},


scroll:{
flexGrow:1,
justifyContent:"center",
padding:25,
},



card:{

backgroundColor:"#FFFFFF",

borderRadius:30,

padding:28,

borderWidth:1,

borderColor:"#475569",

shadowColor:"#000",

shadowOpacity:0.15,

shadowRadius:20,

elevation:8,

},



title:{

fontSize:30,

fontWeight:"900",

color:"#1E3A8A",

marginTop:20,

},



subtitle:{

fontSize:15,

color:"#64748B",

marginTop:8,

lineHeight:22,

},



line:{

width:50,

height:4,

backgroundColor:"#2563EB",

borderRadius:10,

marginVertical:25,

},



label:{

fontSize:15,

fontWeight:"700",

color:"#1E293B",

marginBottom:8,

},



input:{

height:55,

backgroundColor:"#fff",

borderRadius:16,

paddingHorizontal:18,

borderWidth:1,

borderColor:"#CBD5E1",

marginBottom:20,

fontSize:16,

},



button:{

height:58,

backgroundColor:"#2563EB",

borderRadius:18,

alignItems:"center",

justifyContent:"center",

},



disabled:{

opacity:.6,

},



buttonText:{

color:"#fff",

fontSize:17,

fontWeight:"800",

},



back:{

textAlign:"center",

marginTop:25,

color:"#2563EB",

fontWeight:"700",

},



errorBox:{

flexDirection:"row",

alignItems:"center",

gap:8,

backgroundColor:"#FEF2F2",

padding:12,

borderRadius:12,

marginBottom:15,

},



error:{

color:"#DC2626",

flex:1,

},



successBox:{

flexDirection:"row",

alignItems:"center",

gap:8,

backgroundColor:"#F0FDF4",

padding:12,

borderRadius:12,

marginBottom:15,

},



success:{

color:"#16A34A",

flex:1,

},


});