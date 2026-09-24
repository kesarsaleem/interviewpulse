import '../global.css';
import '../lib/deepLinkCache';

import React, { useEffect } from 'react';
import { registerGlobals } from 'react-native-webrtc';

import {
  Stack,
  router,
  useSegments
} from 'expo-router';


import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';


import {
  AuthProvider,
  useAuth
} from '../hooks/useAuth';

import {
  ThemeProvider
} from '../context/ThemeContext';
import { useTheme } from '../context/ThemeContext';

import {
  initDatabase
} from '../lib/sqlite/schema';

import { ROUTES } from '../constants/routes';

registerGlobals();


const queryClient = new QueryClient();




function RouteGuard({
  children
}: {
  children: React.ReactNode
}) {


  const {
    user,
    loading
  } = useAuth();



  const segments = useSegments();




  useEffect(()=>{


    if(loading) return;




    const inAuthGroup =
      segments[0] === '(auth)';

    const isResetPassword =
      segments.includes('reset-password');

    const inAdminGroup =
      segments[0] === 'admin';

    const inInterviewerGroup =
      segments[0] === 'interviewer';

    const inProtectedGroup =
      inAdminGroup ||
      inInterviewerGroup;

    // Supabase password recovery requires an active session to call updateUser({ password }).
    // Do not redirect away from the reset-password screen even if user is authenticated.
    if (isResetPassword) {
      return;
    }

    if(user && inAuthGroup){



      if(user.role === 'admin'){


        router.replace(
          ROUTES.adminDashboard
        );


      }

      else{


        router.replace(
          ROUTES.interviewerHome
        );


      }


      return;

    }





    if(!user && inProtectedGroup){


      router.replace(
        ROUTES.login
      );


      return;


    }




    // Role-based access control: a logged-in user must not be able to
    // sit inside the *other* role's route group (e.g. an interviewer
    // deep-linking into /admin/*). Supabase RLS still protects the
    // underlying data, but the UI shell should redirect immediately
    // rather than let the wrong role browse screens that will just
    // fail to load data.
    if(user && inAdminGroup && user.role !== 'admin'){


      router.replace(
        ROUTES.interviewerHome
      );


      return;


    }




    if(user && inInterviewerGroup && user.role !== 'interviewer'){


      router.replace(
        ROUTES.adminDashboard
      );


      return;


    }



  },[
    user,
    loading,
    segments
  ]);




  return <>{children}</>;
}

function AppNavigator() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}





export default function RootLayout(){

  

  useEffect(()=>{
    try{


      initDatabase();


    }
    catch(error){


      if (__DEV__) {
        console.warn(
          "SQLite init error:",
          error
        );
      }


    }



  },[]);





  return(


    <QueryClientProvider
      client={queryClient}
    >


      <AuthProvider>
        <ThemeProvider>
          <RouteGuard>
            <AppNavigator />
          </RouteGuard>
        </ThemeProvider>
      </AuthProvider>



    </QueryClientProvider>


  );


}