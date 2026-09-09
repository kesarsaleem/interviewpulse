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
  Animated,
  ScrollView
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
import { useTheme } from "../../context/ThemeContext";
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
  const { colors } = useTheme();
  const styles = createStyles(colors);

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
      path === ROUTES.interviewerHome &&
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

      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>

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
            { backgroundColor: colors.card },
            {
              transform: [
                {
                  translateX: slideAnim
                }
              ]
            }
          ]}
        >

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.drawerScroll}
          >

          {/* BLUE HEADER */}

          <View style={styles.drawerHeader}>

          {/* LOGO */}

          <View style={styles.logoContainer}>

            <Image
              source={
                require("../../assets/images/logo.png")
              }
              style={styles.logo}
            />

            <Text style={[styles.logoText, { color: colors.text }]}>
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

              <Text style={[styles.name, { color: colors.text }]}>

                {
                  user?.name ||
                  "Interviewer"
                }

              </Text>


              <Text style={[styles.email, { color: colors.secondaryText }]}>

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

          </View>


          {/* DASHBOARD */}
          <Text style={styles.sectionLabel}>WORKSPACE</Text>

          <Menu
            icon="home-outline"
            title="Dashboard"

            active={
              currentPage === "index"
            }

            onPress={() =>
              navigate(ROUTES.interviewerHome)
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
                ROUTES.interviewerInterviews
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
                ROUTES.interviewerCandidates
              )
            }
          />


          {/* FEEDBACK */}

          <Menu
            icon="chatbox-outline"
            title="Feedback Given"

            active={
              currentPage === "feedback-given"
            }

            onPress={() =>
              navigate(
                ROUTES.interviewerFeedbackGiven
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
                ROUTES.interviewerUpcoming
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
                ROUTES.interviewerSettings
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
                ROUTES.interviewerProfile
              )
            }
          />


          {/* DIVIDER */}

          <View style={styles.line} />
          <Text style={styles.sectionLabel}>ACCOUNT</Text>

          {/* LOGOUT */}

          <Pressable
            style={styles.logout}
            onPress={logout}
          >

            <Ionicons
              name="log-out-outline"
              size={22}
              color={colors.danger}
            />

            <Text style={styles.logoutText}>
              Logout
            </Text>

          </Pressable>

          </ScrollView>

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
  const { colors } = useTheme();
  const styles = createStyles(colors);

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
            active ? colors.primary : colors.secondaryText
          }

        />


        <Text

          style={[
            styles.menuText,
            { color: colors.secondaryText },
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

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({

    /* OVERLAY */

    overlay: {

      flex: 1,

      backgroundColor: colors.overlay,

    },


    /* DRAWER */

    drawerScroll: {
      flexGrow: 1,
      paddingBottom: 30,
    },


    drawer: {

      width: "80%",

      height: "100%",

      backgroundColor: colors.card,

      paddingTop: 52,

      paddingHorizontal: 18,

      borderTopRightRadius: 28,
      borderBottomRightRadius: 28,
      shadowColor: colors.text,
      shadowOffset: { width: 8, height: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 12,

    },


    /* LOGO */

    drawerHeader: {
      backgroundColor: "#06235C",
      marginHorizontal: -18,
      marginTop: -52,
      paddingTop: 60,
      paddingHorizontal: 18,
      paddingBottom: 24,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      marginBottom: 20,
    },

    logoContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 18,
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
      letterSpacing: -0.4,

    },


    /* PROFILE */

    profile: {

      flexDirection: "row",

      alignItems: "center",

      paddingBottom: 20,
      paddingTop: 16,
      paddingHorizontal: 12,
      borderRadius: 18,
      backgroundColor: "transparent",

      marginBottom: 0,

    },


    avatar: {

      height: 45,

      width: 45,

      borderRadius: 23,

      backgroundColor: colors.primary,
      borderWidth: 3,
      borderColor: colors.primaryLight,

      justifyContent: "center",

      alignItems: "center",

      marginRight: 12,

    },


    avatarText: {

      color: colors.surface,

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

      backgroundColor: colors.primaryLight,

      paddingHorizontal: 8,

      paddingVertical: 3,

      borderRadius: 8,

      marginTop: 5,

      alignSelf: "flex-start",

    },


    roleText: {

      color: colors.primary,

      fontSize: 10,

      fontWeight: "800",

    },


    /* MENU */

    menu: {

      minHeight: 48,

      borderRadius: 15,

      paddingHorizontal: 14,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      marginBottom: 7,

    },


    /* ACTIVE MENU */

    activeMenu: {

      backgroundColor: colors.primaryLight,
      borderWidth: 1,
      borderColor: colors.primaryLight,

    },


    menuLeft: {

      flexDirection: "row",

      alignItems: "center",

    },


    menuText: {

      color: colors.secondaryText,

      fontSize: 14,

      marginLeft: 12,

      fontWeight: "700",

    },


    activeText: {

      color: colors.primaryDark,
      fontWeight: "900",

    },


    /* BADGE */

    badge: {

      backgroundColor: colors.primary,

      height: 18,

      width: 18,

      borderRadius: 9,

      alignItems: "center",

      justifyContent: "center",

    },


    badgeText: {

      color: colors.surface,

      fontSize: 10,

      fontWeight: "900",

    },


    /* DIVIDER */

    line: {

      height: 1,

      backgroundColor: colors.divider,

      marginTop: 18,
      marginBottom: 12,
    },

    sectionLabel: {
      color: colors.mutedText,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginLeft: 14,
      marginBottom: 8,
    },


    /* LOGOUT */

    logout: {

      flexDirection: "row",

      alignItems: "center",

      gap: 12,

      paddingHorizontal: 12,

    },


    logoutText: {

      color: colors.danger,

      fontSize: 16,

      fontWeight: "900",

    }

  });