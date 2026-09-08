import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase/client';
export default function ResetPasswordScreen() {

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);


  const handleUpdatePassword = async () => {

    if (!password || password.length < 6) {
      Alert.alert(
        'Invalid Password',
        'Password must be at least 6 characters.'
      );
      return;
    }


    if (password !== confirmPassword) {
      Alert.alert(
        'Password Error',
        'Passwords do not match.'
      );
      return;
    }


    try {

      setLoading(true);


      const { error } =
        await supabase.auth.updateUser({
          password,
        });


      if (error) {
        Alert.alert(
          'Error',
          error.message
        );
        return;
      }


      Alert.alert(
        'Success',
        'Password updated successfully.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login'),
          },
        ]
      );


    } catch {

      Alert.alert(
        'Error',
        'Unable to update password.'
      );

    } finally {

      setLoading(false);

    }
  };


  return (

    <View style={styles.container}>

      <Text style={styles.title}>
        Reset Password
      </Text>


      <Text style={styles.subtitle}>
        Create your new password
      </Text>


      <TextInput
        style={styles.input}
        placeholder="New Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />


      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />


      <Pressable
        style={styles.button}
        onPress={handleUpdatePassword}
        disabled={loading}
      >

        <Text style={styles.buttonText}>
          {loading
            ? 'Updating...'
            : 'Update Password'}
        </Text>

      </Pressable>


    </View>

  );
}


const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25,
    backgroundColor: '#0B0F19',
  },


  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },


  subtitle: {
    color: '#9CA3AF',
    marginBottom: 30,
    fontSize: 16,
  },


  input: {
    height: 55,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    marginBottom: 15,
  },


  button: {
    height: 55,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },


  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

});