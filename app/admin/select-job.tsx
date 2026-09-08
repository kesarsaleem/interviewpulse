import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import React, {
useEffect,
useState
} from "react";


import {
View,
Text,
StyleSheet,
ScrollView,
Pressable,
ActivityIndicator
} from "react-native";


import {
router
} from "expo-router";


import {
supabase
} from "../../lib/supabase/client";




export default function SelectJob(){
  const { colors } = useTheme();
  const styles = createStyles(colors);


const [jobs,setJobs]=useState<any[]>([]);

const [loading,setLoading]=useState(true);





useEffect(()=>{

loadJobs();

},[]);






const loadJobs=async()=>{


try{


const {
data,
error

}=await supabase

.from("jobs")

.select("*")

.eq(
"status",
"open"
)

.order(
"created_at",
{
ascending:false
}
);




if(error){

throw error;

}



setJobs(data || []);



}

catch(error){

console.log(
"LOAD JOB ERROR:",
error
);

}

finally{

setLoading(false);

}


};







if(loading){

return(

<View style={styles.center}>

<ActivityIndicator

size="large"

color={colors.primary}

/>

</View>

);

}








return(


<ScrollView

style={styles.container}

showsVerticalScrollIndicator={false}

>



<Text style={styles.title}>
Select Job
</Text>


<Text style={styles.subtitle}>
Choose a job before adding candidate
</Text>





{

jobs.length===0 ?


<View style={styles.empty}>


<Text style={styles.emptyText}>
No open jobs available
</Text>


</View>



:


jobs.map((job)=>(


<Pressable

key={job.id}

style={styles.card}

onPress={()=>{


router.push({

pathname:"/admin/add-candidate",

params:{

jobId:String(job.id)

}

});


}}

>


<Text style={styles.jobTitle}>

{job.title}

</Text>



<Text style={styles.department}>

{job.department || "General"}

</Text>



<Text style={styles.status}>

{job.status}

</Text>



</Pressable>



))


}



</ScrollView>


);

}








const createStyles = (colors: ThemeColors) => StyleSheet.create({



container:{

flex:1,

backgroundColor:colors.background,

padding:20,

},



center:{

flex:1,

justifyContent:"center",

alignItems:"center",

},



title:{

fontSize:32,

fontWeight:"900",

color: colors.primaryDark,

marginTop:10,

},



subtitle:{

color:colors.secondaryText,

marginTop:5,

marginBottom:25,

},



card:{

backgroundColor:colors.card,

padding:20,

borderRadius:22,

marginBottom:15,

},



jobTitle:{

fontSize:18,

fontWeight:"900",

color:colors.text,

},



department:{

marginTop:6,

color:colors.primary,

fontWeight:"700",

},



status:{

marginTop:10,

color:"#16A34A",

fontWeight:"800",

fontSize:12,

},



empty:{

marginTop:100,

alignItems:"center",

},



emptyText:{

color:colors.secondaryText,

fontSize:16,

}



});