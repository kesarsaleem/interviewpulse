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

import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Circle,
} from "react-native-svg";

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

  const fadeAnim = useRef(
    new Animated.Value(0)
  ).current;


  // Drawer open animation
  useEffect(() => {

    if (visible) {

      Animated.parallel([
        Animated.timing(
          slideAnim,
          {
            toValue: 0,
            duration: 300,
            useNativeDriver: true
          }
        ),
        Animated.timing(
          fadeAnim,
          {
            toValue: 1,
            duration: 220,
            useNativeDriver: true
          }
        ),
      ]).start();

    } else {

      Animated.parallel([
        Animated.timing(
          slideAnim,
          {
            toValue: -300,
            duration: 200,
            useNativeDriver: true
          }
        ),
        Animated.timing(
          fadeAnim,
          {
            toValue: 0,
            duration: 180,
            useNativeDriver: true
          }
        ),
      ]).start();

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

      <View style={styles.overlay}>

        {/* 
          Background area
          Tap anywhere outside drawer to close
        */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.overlay, opacity: fadeAnim }
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>


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

          {/* HEADER */}

          <View style={styles.drawerHeader}>

          <View style={styles.headerGradient} pointerEvents="none">
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id="interviewerHeaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.primaryDark} stopOpacity="1" />
                  <Stop offset="100%" stopColor={"#06235C"} stopOpacity="1" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#interviewerHeaderGrad)" />
              <Circle cx="94%" cy="8%" r="72" fill="#FFFFFF" opacity={0.06} />
              <Circle cx="8%" cy="92%" r="50" fill="#FFFFFF" opacity={0.05} />
            </Svg>
          </View>

          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={10}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>

          {/* LOGO */}

          <View style={styles.logoContainer}>

            <View style={styles.logoBadge}>
              <Image
                source={
                  require("../../assets/images/app_icon.png")
                }
                style={styles.logo}
              />
            </View>

            <Text style={styles.logoText}>
              InterviewPulse
            </Text>

          </View>


          {/* PROFILE */}

          <View style={styles.profile}>

            <View style={styles.avatarRing}>
              <View style={styles.avatar}>

                <Text style={styles.avatarText}>

                  {
                    user?.name?.charAt(0) ||
                    "I"
                  }

                </Text>

              </View>
            </View>


            <View style={styles.profileInfo}>

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
                <View style={styles.roleDot} />
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
            style={({ pressed }) => [
              styles.logout,
              { opacity: pressed ? 0.85 : 1 }
            ]}
            onPress={logout}
          >

            <View style={styles.logoutIconBox}>
              <Ionicons
                name="log-out-outline"
                size={18}
                color={colors.danger}
              />
            </View>

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

      { active && <View style={styles.activeBar} /> }

      <View style={styles.menuLeft}>

        <View
          style={[
            styles.iconBox,
            { backgroundColor: active ? colors.primary : colors.background }
          ]}
        >

          <Ionicons

            name={icon}

            size={17}

            color={
              active ? '#FFFFFF' : colors.secondaryText
            }

          />

        </View>


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

      backgroundColor: "transparent",

    },


    /* DRAWER */

    drawerScroll: {
      flexGrow: 1,
      paddingBottom: 18,
    },


    drawer: {

      width: "80%",

      maxWidth: 320,

      height: "100%",

      backgroundColor: colors.card,

      paddingHorizontal: 14,

      borderTopRightRadius: 28,
      borderBottomRightRadius: 28,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 8, height: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 16,

    },


    /* HEADER */

    drawerHeader: {
       marginHorizontal: -14,
       paddingTop: 44,
      paddingHorizontal: 0,
      paddingBottom: 16,
      overflow: "hidden",
      position: "relative",
      marginBottom: 14,
    },

    headerGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },

    closeButton: {
      position: "absolute",
      right: 12,
      top: 12,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
    },

    logoContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      marginBottom: 14,
    },

    logoBadge: {
      height: 36,
      width: 36,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.16)",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
    },


    logo: {

      height: 30,
      width: 30,

      resizeMode: "contain",

    },


    logoText: {

      color: "#FFFFFF",

      fontSize: 17,

      fontWeight: "900",

      letterSpacing: -0.3,

    },


    /* PROFILE */

    profile: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,

    },


    avatarRing: {
      height: 48,
      width: 48,
      borderRadius: 24,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    avatar: {

      height: 40,
      width: 40,
      borderRadius: 20,

      backgroundColor: "rgba(255,255,255,0.95)",

      justifyContent: "center",

      alignItems: "center",

    },


    avatarText: {

      color: colors.primaryDark,

      fontWeight: "900",

      fontSize: 17,

    },

    profileInfo: {
      flex: 1,
    },


    name: {

      color: "#FFFFFF",

      fontSize: 14,

      fontWeight: "900",

    },


    email: {

      color: "rgba(255,255,255,0.7)",

      fontSize: 10,

      marginTop: 2,

    },


    roleBadge: {

      flexDirection: "row",
      alignItems: "center",

      backgroundColor: "rgba(255,255,255,0.18)",

      paddingHorizontal: 8,
      paddingVertical: 3,

      borderRadius: 20,

      marginTop: 6,

      alignSelf: "flex-start",

    },

    roleDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#4ADE80",
      marginRight: 6,
    },


    roleText: {

      color: "#FFFFFF",

      fontSize: 10,

      fontWeight: "800",

    },


    /* MENU */

    menu: {

      minHeight: 46,

      borderRadius: 14,

      paddingHorizontal: 10,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      marginBottom: 3,

      position: "relative",

      overflow: "hidden",

    },


    /* ACTIVE MENU */

    activeMenu: {

      backgroundColor: colors.primaryLight,

    },

    activeBar: {
      position: "absolute",
      left: 0,
      top: 8,
      bottom: 8,
      width: 3,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },


    menuLeft: {

      flexDirection: "row",

      alignItems: "center",

    },

    iconBox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 11,
    },


    menuText: {

      color: colors.secondaryText,

      fontSize: 13,

      fontWeight: "700",

    },


    activeText: {

      color: colors.primaryDark,
      fontWeight: "900",

    },


    /* BADGE */

    badge: {

      backgroundColor: colors.danger,

      minWidth: 20,

      height: 20,

      paddingHorizontal: 5,

      borderRadius: 10,

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

      backgroundColor: colors.divider,

      marginTop: 12,
      marginBottom: 9,
    },

    sectionLabel: {
      color: colors.mutedText,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginLeft: 12,
      marginBottom: 6,
    },


    /* LOGOUT */

    logout: {

      flexDirection: "row",

      alignItems: "center",

      gap: 11,

      paddingHorizontal: 10,

      paddingVertical: 7,
      borderRadius: 12,

      backgroundColor: colors.dangerLight,

    },

    logoutIconBox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerLight,
    },


    logoutText: {

      color: colors.danger,

      fontSize: 13,

      fontWeight: "800",

    }

  });
