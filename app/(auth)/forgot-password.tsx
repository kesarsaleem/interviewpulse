import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Logo from '../../components/ui/Logo';
import GradientBackground from '../../components/ui/GradientBackground';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function normalizeEmail(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u2060]/g, '')
    .trim()
    .toLowerCase();
}


export default function ForgotPasswordScreen() {

  const { colors } = useTheme();
  const styles = createStyles(colors);

  const { resetPassword } = useAuth();


  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');


  const handleSendResetLink = async () => {

    setError('');
    setSuccess('');

    const normalizedEmail = normalizeEmail(email);


    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }


    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError('Enter a valid email address');
      return;
    }


    try {

      setLoading(true);


      const result = await resetPassword(normalizedEmail);


      if (result.error) {
        setError(result.error);
        return;
      }


      setSuccess(
        'Password reset link has been sent to your email.'
      );


    } catch {

      setError(
        'Unable to send reset link. Please try again.'
      );

    } finally {

      setLoading(false);

    }

  };


  return (

    <GradientBackground>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          <View style={styles.card}>

            <Logo />


            <Text style={styles.title}>
              Forgot Password?
            </Text>


            <Text style={styles.subtitle}>
              Enter your email and we will send you a password reset link.
            </Text>


            <View style={styles.line} />


            {error ? (

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

            ) : null}



            {success ? (

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

            ) : null}



            <Text style={styles.label}>
              Email
            </Text>


            <TextInput

              style={styles.input}

              placeholder="Enter your email"

              placeholderTextColor={
                colors.mutedText
              }

              value={email}

              onChangeText={(value)=>{

                setEmail(value);
                setError('');
                setSuccess('');

              }}

              keyboardType="email-address"

              autoCapitalize="none"

              autoCorrect={false}

            />



            <Button
              label="Send Reset Link"
              onPress={handleSendResetLink}
              loading={loading}
              disabled={loading}
              fullWidth
            />



            <Pressable
              onPress={() => router.back()}
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



const createStyles = (colors: ThemeColors) => StyleSheet.create({

  container:{
    flex:1,
  },


  scroll:{
    flexGrow:1,
    justifyContent:'center',
    padding:25,
  },


  card:{
    backgroundColor:colors.card,
    borderRadius:30,
    padding:28,
    borderWidth:1,
    borderColor:colors.secondaryText,
    elevation:8,
  },


  title:{
    fontSize:30,
    fontWeight:'900',
    color:colors.primaryDark,
    marginTop:20,
  },


  subtitle:{
    fontSize:15,
    color:colors.secondaryText,
    marginTop:8,
    lineHeight:22,
  },


  line:{
    width:50,
    height:4,
    backgroundColor:colors.primary,
    borderRadius:10,
    marginVertical:25,
  },


  label:{
    fontSize:15,
    fontWeight:'700',
    color:colors.text,
    marginBottom:8,
  },


  input:{
    height:55,
    backgroundColor:colors.card,
    borderRadius:16,
    paddingHorizontal:18,
    borderWidth:1,
    borderColor:colors.inputBorder,
    marginBottom:12,
    fontSize:16,
    color:colors.text,
  },


  button:{
    height:58,
    backgroundColor:colors.primary,
    borderRadius:18,
    alignItems:'center',
    justifyContent:'center',
    marginTop:8,
  },


  disabled:{
    opacity:0.6,
  },


  buttonText:{
    color:'#FFFFFF',
    fontSize:17,
    fontWeight:'800',
  },


  back:{
    textAlign:'center',
    marginTop:25,
    color:colors.primary,
    fontWeight:'700',
  },


  errorBox:{
    flexDirection:'row',
    alignItems:'center',
    gap:8,
    backgroundColor:colors.dangerLight,
    padding:12,
    borderRadius:12,
    marginBottom:15,
  },


  error:{
    color:colors.danger,
    flex:1,
  },


  successBox:{
    flexDirection:'row',
    alignItems:'center',
    gap:8,
    backgroundColor:colors.successLight,
    padding:12,
    borderRadius:12,
    marginBottom:15,
  },


  success:{
    color:colors.success,
    flex:1,
  },

});