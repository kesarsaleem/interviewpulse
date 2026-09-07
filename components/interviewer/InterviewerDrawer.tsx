import React, {
  useRef,
  useEffect
} from "react";

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableOpacity,
  Alert,
  Image,
  Animated
} from "react-native";

import {
  router,
  useSegments
} from "expo-router";

import {
  Ionicons
} from "@expo/vector-icons";

import {
  useAuth
} from "../../hooks/useAuth";

import { ROUTES } from "../../constants/routes";

import {
  supabase
} from "../../lib/supabase/client";


type Props = {
  visible: boolean;
  onClose: () => void;
};


export default function InterviewerDrawer({
  visible,
  onClose
}: Props) {

  const { user } = useAuth();

  const segments = useSegments();

  const currentPage =
    segments[segments.length - 1];

  console.log("CURRENT PAGE:", currentPage);


  const slideAnim = useRef(
    new Animated.Value(-300)
  ).current;


  // Drawer open animation
  useEffect(() => {

    if (visible) {

      Animated.timing(
        slideAnim,
        {
          toValue: 0,
          duration: 300,
          useNativeDriver: true
        }
      ).start();

    } else {

      Animated.timing(
        slideAnim,
        {
          toValue: -300,
          duration: 200,
          useNativeDriver: true
        }
      ).start();

    }

  }, [visible]);


  // Logout
  const logout = () => {

    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [

        {
          text: "Cancel",
          style: "cancel"
        },

        {
          text: "Logout",
          style: "destructive",

          onPress: async () => {

            await supabase.auth.signOut();

            onClose();

            router.replace(ROUTES.login);

          }
        }

      ]
    );

  };


  // Navigation
  const navigate = (path: string) => {

    // Close drawer first
    onClose();


    // Don't navigate if already on dashboard
    if (
      path === "/interviewer" &&
      currentPage === "index"
    ) {
      return;
    }


    // Small delay so drawer closes smoothly
    setTimeout(() => {

      router.push(path as any);

    }, 100);

  };


  return (

    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >

      <View style={styles.overlay}>

        {/* 
          Background area
          Tap anywhere outside drawer to close
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />


        {/* DRAWER */}

        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [
                {
                  translateX: slideAnim
                }
              ]
            }
          ]}
        >


          {/* LOGO */}

          <View style={styles.logoContainer}>

            <Image
              source={
                require("../../assets/images/logo.png")
              }
              style={styles.logo}
            />

            <Text style={styles.logoText}>
              InterviewPulse
            </Text>

          </View>


          {/* PROFILE */}

          <View style={styles.profile}>

            <View style={styles.avatar}>

              <Text style={styles.avatarText}>

                {
                  user?.name?.charAt(0) ||
                  "I"
                }

              </Text>

            </View>


            <View>

              <Text style={styles.name}>

                {
                  user?.name ||
                  "Interviewer"
                }

              </Text>


              <Text style={styles.email}>

                {
                  user?.email ||
                  ""
                }

              </Text>


              <View style={styles.roleBadge}>

                <Text style={styles.roleText}>
                  Interviewer
                </Text>

              </View>

            </View>

          </View>


          {/* DASHBOARD */}

          <Menu
            icon="home-outline"
            title="Dashboard"

            active={
              currentPage === "index"
            }

            onPress={() =>
              navigate("/interviewer")
            }
          />


          {/* MY INTERVIEWS */}

          <Menu
            icon="briefcase-outline"
            title="My Interviews"

            active={
              currentPage === "interviews"
            }

            onPress={() =>
              navigate(
                "/interviewer/interviews"
              )
            }
          />


          {/* CANDIDATES */}

          <Menu
            icon="person-outline"
            title="Candidates"

            active={
              currentPage === "candidates"
            }

            onPress={() =>
              navigate(
                "/interviewer/candidates"
              )
            }
          />


          {/* FEEDBACK */}

          <Menu
            icon="chatbox-outline"
            title="Feedback Given"

            active={
              currentPage === "feedback"
            }

            onPress={() =>
              navigate(
                "/interviewer/feedback"
              )
            }
          />


          {/* UPCOMING */}

          <Menu
            icon="calendar-outline"
            title="Upcoming Interviews"

            active={
              currentPage === "upcoming"
            }

            onPress={() =>
              navigate(
                "/interviewer/upcoming"
              )
            }
          />


          {/* SYNC DATA */}

          <Menu
            icon="sync-outline"
            title="Sync Data"

            active={false}

            onPress={() => {

              Alert.alert(
                "Sync Data",
                "Data sync feature coming soon."
              );

            }}
          />


          {/* NOTIFICATIONS */}

          <Menu
            icon="notifications-outline"
            title="Notifications"

            badge="3"

            active={false}

            onPress={() => {

              Alert.alert(
                "Notifications",
                "Notifications screen coming soon."
              );

            }}
          />


          {/* SETTINGS */}

          <Menu
            icon="settings-outline"
            title="Settings"

            active={
              currentPage === "settings"
            }

            onPress={() =>
              navigate(
                "/interviewer/settings"
              )
            }
          />


          {/* PROFILE */}

          <Menu
            icon="person-circle-outline"
            title="Profile"

            active={
              currentPage === "profile"
            }

            onPress={() =>
              navigate(
                "/interviewer/profile"
              )
            }
          />


          {/* DIVIDER */}

          <View style={styles.line} />


          {/* LOGOUT */}

          <Pressable
            style={styles.logout}
            onPress={logout}
          >

            <Ionicons
              name="log-out-outline"
              size={22}
              color="#EF4444"
            />

            <Text style={styles.logoutText}>
              Logout
            </Text>

          </Pressable>


        </Animated.View>

      </View>

    </Modal>

  );

}


/* =========================
   MENU COMPONENT
========================= */

function Menu({
  icon,
  title,
  active,
  badge,
  onPress
}: any) {

  return (

    <TouchableOpacity

      style={[
        styles.menu,
        active &&
        styles.activeMenu
      ]}

      onPress={onPress}

      activeOpacity={0.7}

    >

      <View style={styles.menuLeft}>

        <Ionicons

          name={icon}

          size={21}

          color={
            active
              ? "#FFFFFF"
              : "#CBD5E1"
          }

        />


        <Text

          style={[
            styles.menuText,
            active &&
            styles.activeText
          ]}

        >

          {title}

        </Text>

      </View>


      {/* BADGE */}

      {
        badge && (

          <View style={styles.badge}>

            <Text style={styles.badgeText}>
              {badge}
            </Text>

          </View>

        )
      }

    </TouchableOpacity>

  );

}


/* =========================
   STYLES
========================= */

const styles =
  StyleSheet.create({

    /* OVERLAY */

    overlay: {

      flex: 1,

      backgroundColor:
        "rgba(0,0,0,0.3)",

    },


    /* DRAWER */

    drawer: {

      width: "75%",

      height: "100%",

      backgroundColor: "#05245C",

      paddingTop: 35,

      paddingHorizontal: 15,

    },


    /* LOGO */

    logoContainer: {

      flexDirection: "row",

      alignItems: "center",

      marginBottom: 25,

    },


    logo: {

      height: 45,

      width: 45,

      resizeMode: "contain",

    },


    logoText: {

      color: "#FFFFFF",

      fontSize: 20,

      fontWeight: "900",

      marginLeft: 10,

    },


    /* PROFILE */

    profile: {

      flexDirection: "row",

      alignItems: "center",

      paddingBottom: 20,

      borderBottomWidth: 1,

      borderColor: "#16366F",

      marginBottom: 15,

    },


    avatar: {

      height: 45,

      width: 45,

      borderRadius: 23,

      backgroundColor: "#2563EB",

      justifyContent: "center",

      alignItems: "center",

      marginRight: 12,

    },


    avatarText: {

      color: "#FFFFFF",

      fontWeight: "900",

      fontSize: 20,

    },


    name: {

      color: "#FFFFFF",

      fontSize: 15,

      fontWeight: "900",

    },


    email: {

      color: "#CBD5E1",

      fontSize: 11,

      marginTop: 2,

    },


    roleBadge: {

      backgroundColor: "#2563EB",

      paddingHorizontal: 8,

      paddingVertical: 3,

      borderRadius: 8,

      marginTop: 5,

      alignSelf: "flex-start",

    },


    roleText: {

      color: "#FFFFFF",

      fontSize: 10,

      fontWeight: "800",

    },


    /* MENU */

    menu: {

      height: 45,

      borderRadius: 12,

      paddingHorizontal: 12,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      marginBottom: 5,

    },


    /* ACTIVE MENU */

    activeMenu: {

      backgroundColor: "#2563EB",

    },


    menuLeft: {

      flexDirection: "row",

      alignItems: "center",

    },


    menuText: {

      color: "#CBD5E1",

      fontSize: 14,

      marginLeft: 12,

      fontWeight: "700",

    },


    activeText: {

      color: "#FFFFFF",

    },


    /* BADGE */

    badge: {

      backgroundColor: "#2563EB",

      height: 18,

      width: 18,

      borderRadius: 9,

      alignItems: "center",

      justifyContent: "center",

    },


    badgeText: {

      color: "#FFFFFF",

      fontSize: 10,

      fontWeight: "900",

    },


    /* DIVIDER */

    line: {

      height: 1,

      backgroundColor: "#16366F",

      marginVertical: 20,

    },


    /* LOGOUT */

    logout: {

      flexDirection: "row",

      alignItems: "center",

      gap: 12,

      paddingHorizontal: 12,

    },


    logoutText: {

      color: "#EF4444",

      fontSize: 16,

      fontWeight: "900",

    }

  });