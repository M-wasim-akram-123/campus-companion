import "react-native-url-polyfill/auto";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { createClient, type Session } from "@supabase/supabase-js";

type DocumentType = "cnic_b_form" | "guardian_cnic" | "domicile" | "matric_result_card" | "other_supporting";
type DocumentStatus = "pending_review" | "approved" | "rejected";

type StudentDocument = {
  id: string;
  student_id: string;
  document_type: DocumentType;
  status: DocumentStatus;
  file_path: string;
  original_file_name: string | null;
  mime_type: string | null;
  rejection_reason: string | null;
  uploaded_at: string;
  version: number;
};

type StudentExamResult = {
  testId: string;
  subjectName: string;
  testName: string;
  testDate: string;
  maxMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
};

type StudentExamSchedule = {
  testId: string;
  seriesName: string;
  subjectName: string;
  testDate: string;
  maxMarks: number;
  teacherName: string | null;
};

type StudentProfile = {
  id: string;
  full_name: string;
  father_name: string | null;
  roll_number: string;
  cnic: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_occupation: string | null;
  guardian_details: string | null;
  matric_school: string | null;
  matric_marks_obtained: number | null;
  matric_marks_total: number | null;
  programs?: { name?: string } | null;
  classes?: { name?: string } | null;
  sections?: { name?: string; gender?: string } | null;
  academic_sessions?: { label?: string } | null;
};

type FeeInstallment = {
  id: string;
  label: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
};

type FeePayment = {
  id: string;
  amount: number;
  receipt_number: string;
  payment_method: string;
  paid_at: string;
};

type FeeVoucher = {
  id: string;
  voucher_number: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
};

type ActiveTab = "home" | "documents" | "profile" | "fees" | "vouchers" | "exams" | "announcements" | "account";

type StudentAnnouncement = {
  id: string;
  title: string;
  body_text: string | null;
  content_type: "text" | "voice" | "video";
  media_path: string | null;
  media_mime_type: string | null;
  published_at: string | null;
};

const theme = {
  green: "#00843d",
  greenDark: "#005f2c",
  greenSoft: "#e8f7ef",
  mint: "#d1fae5",
  gold: "#f59e0b",
  red: "#dc2626",
  blue: "#2563eb",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#d8eadf",
  bg: "#f3fbf6",
  card: "#ffffff",
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === "web") return Promise.resolve(window.localStorage.getItem(key));
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === "web") {
      window.localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const requiredDocuments: { type: DocumentType; label: string; description: string }[] = [
  { type: "cnic_b_form", label: "CNIC / B-Form", description: "Student identity document" },
  { type: "guardian_cnic", label: "Parent / Guardian CNIC", description: "Parent or guardian CNIC scan" },
  { type: "domicile", label: "Domicile", description: "Student domicile certificate" },
  { type: "matric_result_card", label: "Matric result card", description: "Matric marks/result card" },
  { type: "other_supporting", label: "Other supporting document", description: "Any additional required document" },
];

function statusLabel(status?: DocumentStatus) {
  if (!status) return "Missing";
  if (status === "pending_review") return "Pending review";
  if (status === "approved") return "Approved";
  return "Rejected";
}

function statusColor(status?: DocumentStatus) {
  if (status === "approved") return theme.green;
  if (status === "pending_review") return theme.gold;
  if (status === "rejected") return theme.red;
  return theme.muted;
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toE164Phone(phone: string) {
  const raw = phone.trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `+92${digits}`;
  return raw;
}

function usernameToLoginEmail(username: string) {
  return `${username.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@student.campus.local`;
}

function loginIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed;
  return usernameToLoginEmail(trimmed);
}

function formatCurrency(value: number) {
  return `PKR ${Math.round(Number(value || 0)).toLocaleString()}`;
}

async function uriToBlob(uri: string) {
  const res = await fetch(uri);
  return res.blob();
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.88)).current;
  const promptedPasswordUserId = useRef<string | null>(null);
  const [busyType, setBusyType] = useState<DocumentType | null>(null);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    phone: "",
    email: "",
    address: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_occupation: "",
    guardian_details: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [installments, setInstallments] = useState<FeeInstallment[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [vouchers, setVouchers] = useState<FeeVoucher[]>([]);
  const [examResults, setExamResults] = useState<StudentExamResult[]>([]);
  const [examSchedule, setExamSchedule] = useState<StudentExamSchedule[]>([]);
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(splashOpacity, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(splashScale, {
        toValue: 1,
        friction: 5,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
    const timer = setTimeout(() => setShowSplash(false), 2600);
    return () => clearTimeout(timer);
  }, [splashOpacity, splashScale]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const upcomingBySeries = useMemo(() => {
    return examSchedule.reduce<Record<string, StudentExamSchedule[]>>((groups, row) => {
      groups[row.seriesName] = groups[row.seriesName] ?? [];
      groups[row.seriesName].push(row);
      return groups;
    }, {});
  }, [examSchedule]);

  const resultsBySeries = useMemo(() => {
    return examResults.reduce<Record<string, StudentExamResult[]>>((groups, row) => {
      groups[row.testName] = groups[row.testName] ?? [];
      groups[row.testName].push(row);
      return groups;
    }, {});
  }, [examResults]);

  const formatTestDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(y, m - 1, d).toLocaleDateString("en-PK", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const byType = useMemo(() => {
    const map = new Map<DocumentType, StudentDocument>();
    for (const doc of documents) {
      const existing = map.get(doc.document_type);
      if (!existing || new Date(doc.uploaded_at).getTime() > new Date(existing.uploaded_at).getTime()) {
        map.set(doc.document_type, doc);
      }
    }
    return map;
  }, [documents]);

  const loadData = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data: studentRow, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, father_name, roll_number, cnic, date_of_birth, gender, phone, email, address, guardian_name, guardian_phone, guardian_occupation, guardian_details, matric_school, matric_marks_obtained, matric_marks_total, programs(name), classes(name), sections(name, gender), academic_sessions(label), user_id")
      .eq("user_id", user.user.id)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!studentRow) throw new Error("No student profile is linked with this login.");
    setStudent(studentRow as StudentProfile);
    setProfileForm({
      phone: studentRow.phone ?? "",
      email: studentRow.email ?? "",
      address: studentRow.address ?? "",
      guardian_name: studentRow.guardian_name ?? "",
      guardian_phone: studentRow.guardian_phone ?? "",
      guardian_occupation: studentRow.guardian_occupation ?? "",
      guardian_details: studentRow.guardian_details ?? "",
    });

    const today = new Date().toISOString().slice(0, 10);
    const [
      { data: docs, error: docsError },
      { data: feeRows, error: feeError },
      { data: paymentRows, error: paymentError },
      { data: voucherRows, error: voucherError },
      { data: examRows, error: examError },
      { data: scheduleRows, error: scheduleError },
      { data: announcementRows, error: announcementError },
    ] = await Promise.all([
      supabase
        .from("student_documents")
        .select("*")
        .eq("student_id", studentRow.id)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("student_fee_installments")
        .select("id, label, amount, paid_amount, due_date, status")
        .eq("student_id", studentRow.id)
        .order("due_date"),
      supabase
        .from("fee_payments")
        .select("id, amount, receipt_number, payment_method, paid_at")
        .eq("student_id", studentRow.id)
        .order("paid_at", { ascending: false }),
      supabase
        .from("fee_vouchers")
        .select("id, voucher_number, due_date, total_amount, paid_amount, status")
        .eq("student_id", studentRow.id)
        .in("status", ["issued", "partial"])
        .order("due_date"),
      supabase
        .from("internal_test_marks")
        .select(
          "marks_obtained, is_absent, internal_tests!inner(id, subject_name, test_name, test_date, max_marks, status)",
        )
        .eq("student_id", studentRow.id)
        .eq("internal_tests.status", "published")
        .order("test_date", { referencedTable: "internal_tests", ascending: false }),
      supabase
        .from("internal_tests")
        .select(
          "id, subject_name, test_name, test_date, max_marks, teacher_name, internal_test_series!inner(name)",
        )
        .eq("status", "draft")
        .not("series_id", "is", null)
        .gte("test_date", today)
        .order("test_date", { ascending: true })
        .order("subject_name", { ascending: true }),
      supabase
        .from("announcements")
        .select("id, title, body_text, content_type, media_path, media_mime_type, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false }),
    ]);
    if (docsError) throw docsError;
    if (feeError) throw feeError;
    if (paymentError) throw paymentError;
    if (voucherError) throw voucherError;
    if (examError) throw examError;
    if (scheduleError) throw scheduleError;
    if (announcementError) throw announcementError;
    setDocuments((docs ?? []) as StudentDocument[]);
    setInstallments((feeRows ?? []) as FeeInstallment[]);
    setPayments((paymentRows ?? []) as FeePayment[]);
    setVouchers((voucherRows ?? []) as FeeVoucher[]);
    setExamResults(
      (examRows ?? []).map((row) => {
        const test = row.internal_tests as {
          id: string;
          subject_name: string;
          test_name: string;
          test_date: string;
          max_marks: number;
        };
        return {
          testId: test.id,
          subjectName: test.subject_name,
          testName: test.test_name,
          testDate: test.test_date,
          maxMarks: Number(test.max_marks),
          marksObtained: row.marks_obtained != null ? Number(row.marks_obtained) : null,
          isAbsent: row.is_absent,
        };
      }),
    );
    setExamSchedule(
      (scheduleRows ?? []).map((row) => {
        const series = row.internal_test_series as { name?: string } | null;
        return {
          testId: row.id,
          seriesName: series?.name ?? row.test_name,
          subjectName: row.subject_name,
          testDate: row.test_date,
          maxMarks: Number(row.max_marks),
          teacherName: row.teacher_name ?? null,
        };
      }),
    );
    setAnnouncements((announcementRows ?? []) as StudentAnnouncement[]);
  };

  const openAnnouncementMedia = async (path: string) => {
    const { data, error } = await supabase.storage.from("announcement-media").createSignedUrl(path, 600);
    if (error) return Alert.alert("Could not open media", error.message);
    await Linking.openURL(data.signedUrl);
  };

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    loadData()
      .then(() => {
        if (promptedPasswordUserId.current === session.user.id) return;
        promptedPasswordUserId.current = session.user.id;
        Alert.alert(
          "Change temporary password",
          "For your security, please change the temporary password to something easy for you to remember.",
          [
            { text: "Later", style: "cancel" },
            { text: "Change now", onPress: () => setActiveTab("account") },
          ],
        );
      })
      .catch((error) => Alert.alert("Could not load profile", error.message))
      .finally(() => setLoading(false));
  }, [session]);

  const signIn = async () => {
    if (!login.trim() || !password) return Alert.alert("Login required", "Enter phone/email and password.");
    setLoading(true);
    try {
      const normalizedLogin = loginIdentifier(login);
      const credentials = normalizedLogin.includes("@")
        ? { email: normalizedLogin, password }
        : { phone: normalizedLogin, password };
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
    } catch (error: any) {
      console.error("Supabase login failed", error);
      const message = String(error.message || "");
      const phoneAuthDisabled = message.toLowerCase().includes("phone logins are disabled");
      Alert.alert(
        "Login failed",
        phoneAuthDisabled
          ? "Phone login is disabled in Supabase Auth. Please use the admission number / username, not the phone number."
          : `${message || "Please check your credentials."}\n\nLogin used: ${loginIdentifier(login)}\n\nUse username/admission no. or email with the latest temporary password.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    const value = login.trim();
    if (!value) {
      return Alert.alert("Enter username or email", "Type your admission number/username or email first.");
    }
    if (!value.includes("@")) {
      return Alert.alert(
        "Password reset",
        "Please contact the college office to reset your password. The office can reset it from your student profile and give you a new temporary password.",
      );
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(value);
      if (error) throw error;
      Alert.alert("Reset email sent", "Please check your email for the password reset link.");
    } catch (error: any) {
      Alert.alert("Could not send reset email", error.message || "Please contact the college office.");
    }
  };

  const uploadDocument = async (type: DocumentType, source: "camera" | "file") => {
    const doc = byType.get(type);
    if (doc?.status === "approved" || doc?.status === "pending_review") {
      return Alert.alert("Locked", "This document is already submitted or approved.");
    }

    setBusyType(type);
    try {
      let asset: { uri: string; name?: string | null; mimeType?: string | null; fileName?: string | null; fileSize?: number } | null = null;
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Camera permission is required.");
        const result = await ImagePicker.launchCameraAsync({
          quality: 0.75,
          allowsEditing: false,
        });
        if (result.canceled) return;
        asset = result.assets[0];
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        asset = result.assets[0];
      }

      if (!student?.id || !asset) return;
      const name = asset.name || asset.fileName || `${type}.jpg`;
      const ext = name.split(".").pop() || "jpg";
      const blob = await uriToBlob(asset.uri);
      const filePath = `students/${student.id}/${type}/${randomId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("student-documents")
        .upload(filePath, blob, {
          contentType: asset.mimeType || blob.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: submitError } = await supabase.rpc("submit_student_document", {
        p_document_type: type,
        p_file_path: filePath,
        p_original_file_name: name,
        p_mime_type: asset.mimeType || blob.type || null,
        p_file_size: asset.fileSize || blob.size,
      });
      if (submitError) throw submitError;
      Alert.alert("Uploaded", "Your document has been submitted for review.");
      await loadData();
    } catch (error: any) {
      Alert.alert("Upload failed", error.message || "Could not upload document.");
    } finally {
      setBusyType(null);
    }
  };

  const openDocument = async (doc: StudentDocument) => {
    const { data, error } = await supabase.storage.from("student-documents").createSignedUrl(doc.file_path, 600);
    if (error || !data?.signedUrl) return Alert.alert("Preview failed", error?.message || "Could not open document.");
    Linking.openURL(data.signedUrl);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { error } = await supabase.rpc("student_update_own_profile", {
        p_phone: profileForm.phone,
        p_email: profileForm.email,
        p_address: profileForm.address,
        p_guardian_name: profileForm.guardian_name,
        p_guardian_phone: profileForm.guardian_phone,
        p_guardian_occupation: profileForm.guardian_occupation,
        p_guardian_details: profileForm.guardian_details,
      });
      if (error) throw error;
      Alert.alert("Saved", "Your profile information has been updated.");
      await loadData();
    } catch (error: any) {
      Alert.alert("Could not save profile", error.message || "Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) return Alert.alert("Password too short", "Password must be at least 8 characters.");
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      Alert.alert("Password changed", "Your new password has been saved.");
    } catch (error: any) {
      Alert.alert("Could not change password", error.message || "Please try again.");
    } finally {
      setChangingPassword(false);
    }
  };

  if (showSplash) {
    return (
      <SafeAreaView style={styles.splash}>
        <Animated.View style={[styles.splashContent, { opacity: splashOpacity, transform: [{ scale: splashScale }] }]}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>SC</Text>
          </View>
          <Text style={styles.splashTitle}>Superior College</Text>
          <Text style={styles.splashSubtitle}>Mian Channu</Text>
          <Text style={styles.splashSmall}>Student Portal</Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginCard}>
          <Text style={styles.title}>Superior College</Text>
          <Text style={styles.subtitle}>Mian Channu Student Portal</Text>
          <Text style={styles.muted}>Login with your username/admission no. and password.</Text>
          <TextInput style={styles.input} value={login} onChangeText={setLogin} placeholder="Username / admission no. / email" autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
          <Pressable style={styles.primaryButton} onPress={signIn}>
            <Text style={styles.primaryButtonText}>Login</Text>
          </Pressable>
          <Pressable onPress={forgotPassword}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.smallLogo}>
            <Text style={styles.smallLogoText}>SC</Text>
          </View>
          <Pressable onPress={() => supabase.auth.signOut()}><Text style={styles.signOut}>Sign out</Text></Pressable>
        </View>
        <Text style={styles.heroKicker}>Superior College Mian Channu</Text>
        <Text style={styles.heroTitle}>{student?.full_name || "Student"}</Text>
        <Text style={styles.heroSubtitle}>
          {student?.roll_number || "Student Portal"}{student?.classes?.name ? ` · ${student.classes.name}` : ""}
        </Text>
      </View>

      <View style={styles.tabs}>
        {(["home", "documents", "profile", "fees", "vouchers", "exams", "announcements", "account"] as ActiveTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab[0].toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {activeTab === "home" && (
          <>
            <View style={styles.docCard}>
              <Text style={styles.sectionTitle}>Student information</Text>
              <Text style={styles.sectionHint}>Your portal summary and college record.</Text>
              <InfoRow label="Admission no." value={student?.roll_number} />
              <InfoRow label="Name" value={student?.full_name} />
              <InfoRow label="Father name" value={student?.father_name} />
              <InfoRow label="Program" value={student?.programs?.name} />
              <InfoRow label="Class" value={student?.classes?.name} />
              <InfoRow label="Section" value={student?.sections?.name} />
              <InfoRow label="Session" value={student?.academic_sessions?.label} />
            </View>
            <SummaryCard
              title="Quick summary"
              lines={[
                ["Documents approved", `${requiredDocuments.filter((item) => byType.get(item.type)?.status === "approved").length}/${requiredDocuments.length}`],
                ["Open vouchers", String(vouchers.length)],
                ["Paid receipts", String(payments.length)],
                ["Upcoming tests", String(examSchedule.length)],
                ["Announcements", String(announcements.length)],
                ["Fee balance", formatCurrency(installments.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)), 0))],
              ]}
            />
          </>
        )}

        {activeTab === "documents" && requiredDocuments.map((item) => {
          const doc = byType.get(item.type);
          const locked = doc?.status === "approved" || doc?.status === "pending_review";
          return (
            <View key={item.type} style={styles.docCard}>
              <View style={styles.docHeader}>
                <Text style={styles.docTitle}>{item.label}</Text>
                <Text style={[styles.statusPill, { color: statusColor(doc?.status), backgroundColor: `${statusColor(doc?.status)}18` }]}>
                  {statusLabel(doc?.status)}
                </Text>
              </View>
              <Text style={styles.muted}>{item.description}</Text>
              {doc?.rejection_reason ? <Text style={styles.rejection}>Rejected: {doc.rejection_reason}</Text> : null}
              <View style={styles.actions}>
                {doc ? (
                  <Pressable style={styles.secondaryButton} onPress={() => openDocument(doc)}>
                    <Text style={styles.secondaryButtonText}>Preview</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.secondaryButton, locked && styles.disabledButton]}
                  disabled={locked || busyType === item.type}
                  onPress={() => uploadDocument(item.type, "camera")}
                >
                  <Text style={styles.secondaryButtonText}>{busyType === item.type ? "Uploading..." : "Scan"}</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, locked && styles.disabledButton]}
                  disabled={locked || busyType === item.type}
                  onPress={() => uploadDocument(item.type, "file")}
                >
                  <Text style={styles.secondaryButtonText}>Upload file</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {activeTab === "profile" && (
          <View style={styles.docCard}>
            <Text style={styles.sectionTitle}>Basic information</Text>
            <Text style={styles.sectionHint}>Your academic details are protected by college records.</Text>
            <InfoRow label="Name" value={student?.full_name} />
            <InfoRow label="Father name" value={student?.father_name} />
            <InfoRow label="CNIC / B-Form" value={student?.cnic} />
            <InfoRow label="Date of birth" value={student?.date_of_birth} />
            <InfoRow label="Gender" value={student?.gender} />
            <InfoRow label="Program" value={student?.programs?.name} />
            <InfoRow label="Class" value={student?.classes?.name} />
            <InfoRow label="Section" value={student?.sections?.name} />
            <InfoRow label="Session" value={student?.academic_sessions?.label} />
            <InfoRow
              label="Matric marks"
              value={
                student?.matric_marks_obtained != null && student?.matric_marks_total != null
                  ? `${student.matric_marks_obtained} / ${student.matric_marks_total}`
                  : "Not available"
              }
            />
            <Text style={styles.readOnlyNote}>Academic, matric marks, and fee data are read-only. Contact office for correction.</Text>

            <Text style={styles.sectionTitle}>Editable contact details</Text>
            <LabeledInput label="Phone" value={profileForm.phone} onChangeText={(v) => setProfileForm({ ...profileForm, phone: v })} />
            <LabeledInput label="Email" value={profileForm.email} onChangeText={(v) => setProfileForm({ ...profileForm, email: v })} />
            <LabeledInput label="Address" value={profileForm.address} onChangeText={(v) => setProfileForm({ ...profileForm, address: v })} multiline />
            <LabeledInput label="Guardian name" value={profileForm.guardian_name} onChangeText={(v) => setProfileForm({ ...profileForm, guardian_name: v })} />
            <LabeledInput label="Guardian phone" value={profileForm.guardian_phone} onChangeText={(v) => setProfileForm({ ...profileForm, guardian_phone: v })} />
            <LabeledInput label="Guardian occupation" value={profileForm.guardian_occupation} onChangeText={(v) => setProfileForm({ ...profileForm, guardian_occupation: v })} />
            <LabeledInput label="Guardian details" value={profileForm.guardian_details} onChangeText={(v) => setProfileForm({ ...profileForm, guardian_details: v })} multiline />
            <Pressable style={styles.primaryButton} disabled={savingProfile} onPress={saveProfile}>
              <Text style={styles.primaryButtonText}>{savingProfile ? "Saving..." : "Save profile"}</Text>
            </Pressable>
          </View>
        )}

        {activeTab === "fees" && (
          <>
            <SummaryCard
              title="Fee summary"
              lines={[
                ["Total fee", formatCurrency(installments.reduce((sum, row) => sum + Number(row.amount || 0), 0))],
                ["Paid", formatCurrency(installments.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0))],
                ["Balance", formatCurrency(installments.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)), 0))],
              ]}
            />
            <Text style={styles.sectionTitle}>Fee structure</Text>
            {installments.map((row) => (
              <View key={row.id} style={styles.docCard}>
                <View style={styles.docHeader}>
                  <Text style={styles.docTitle}>{row.label}</Text>
                  <Text style={styles.statusPill}>{row.status}</Text>
                </View>
                <InfoRow label="Due date" value={row.due_date} />
                <InfoRow label="Amount" value={formatCurrency(row.amount)} />
                <InfoRow label="Paid" value={formatCurrency(row.paid_amount)} />
                <InfoRow label="Balance" value={formatCurrency(Math.max(0, Number(row.amount) - Number(row.paid_amount)))} />
              </View>
            ))}
            <Text style={styles.sectionTitle}>Paid fees</Text>
            {payments.length ? payments.map((payment) => (
              <View key={payment.id} style={styles.docCard}>
                <View style={styles.docHeader}>
                  <Text style={styles.docTitle}>{formatCurrency(payment.amount)}</Text>
                  <Text style={styles.status}>{payment.payment_method}</Text>
                </View>
                <InfoRow label="Receipt" value={payment.receipt_number} />
                <InfoRow label="Paid at" value={new Date(payment.paid_at).toLocaleString()} />
              </View>
            )) : <Text style={styles.muted}>No paid fee receipts yet.</Text>}
          </>
        )}

        {activeTab === "vouchers" && (
          <>
            <Text style={styles.sectionTitle}>Incoming / open vouchers</Text>
            {vouchers.length ? vouchers.map((voucher) => {
              const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));
              return (
                <View key={voucher.id} style={styles.docCard}>
                  <View style={styles.docHeader}>
                    <Text style={styles.docTitle}>{voucher.voucher_number}</Text>
                    <Text style={styles.statusPill}>{voucher.status}</Text>
                  </View>
                  <InfoRow label="Due date" value={voucher.due_date} />
                  <InfoRow label="Total" value={formatCurrency(voucher.total_amount)} />
                  <InfoRow label="Paid" value={formatCurrency(voucher.paid_amount)} />
                  <InfoRow label="Balance" value={formatCurrency(balance)} />
                </View>
              );
            }) : <Text style={styles.muted}>No open vouchers right now.</Text>}
          </>
        )}

        {activeTab === "exams" && (
          <>
            <Text style={styles.sectionTitle}>Upcoming tests</Text>
            <Text style={styles.sectionHint}>Scheduled college tests for your section.</Text>
            {examSchedule.length ? (
              Object.entries(upcomingBySeries).map(([seriesName, rows]) => (
                <View key={`upcoming-${seriesName}`} style={styles.docCard}>
                  <Text style={styles.docTitle}>{seriesName}</Text>
                  {[...rows]
                    .sort((a, b) => a.testDate.localeCompare(b.testDate) || a.subjectName.localeCompare(b.subjectName))
                    .map((row) => (
                      <View key={row.testId} style={{ marginTop: 10 }}>
                        <View style={styles.docHeader}>
                          <Text style={styles.sectionTitle}>{row.subjectName}</Text>
                          <Text style={[styles.statusPill, { color: theme.blue, backgroundColor: `${theme.blue}18` }]}>
                            Upcoming
                          </Text>
                        </View>
                        <InfoRow label="Date" value={formatTestDate(row.testDate)} />
                        <InfoRow label="Max marks" value={row.maxMarks} />
                        {row.teacherName ? <InfoRow label="Teacher" value={row.teacherName} /> : null}
                      </View>
                    ))}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No upcoming tests scheduled right now.</Text>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Published results</Text>
            <Text style={styles.sectionHint}>Marks released by the exam branch.</Text>
            {examResults.length ? (
              Object.entries(resultsBySeries).map(([seriesName, rows]) => (
                <View key={`results-${seriesName}`} style={styles.docCard}>
                  <Text style={styles.docTitle}>{seriesName}</Text>
                  {[...rows]
                    .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
                    .map((row) => (
                    <View key={row.testId} style={{ marginTop: 10 }}>
                      <View style={styles.docHeader}>
                        <Text style={styles.sectionTitle}>{row.subjectName}</Text>
                        <Text style={styles.statusPill}>
                          {row.isAbsent ? "Absent" : `${row.marksObtained ?? 0} / ${row.maxMarks}`}
                        </Text>
                      </View>
                      <InfoRow label="Date" value={formatTestDate(row.testDate)} />
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No published test results yet.</Text>
            )}
          </>
        )}

        {activeTab === "announcements" && (
          <>
            <Text style={styles.sectionTitle}>College announcements</Text>
            <Text style={styles.sectionHint}>Messages from the college for your class and section.</Text>
            {announcements.length ? (
              announcements.map((item) => (
                <View key={item.id} style={styles.docCard}>
                  <View style={styles.docHeader}>
                    <Text style={styles.docTitle}>{item.title}</Text>
                    <Text style={[styles.statusPill, { color: theme.green, backgroundColor: `${theme.green}18` }]}>
                      {item.content_type}
                    </Text>
                  </View>
                  {item.published_at ? (
                    <InfoRow
                      label="Posted"
                      value={new Date(item.published_at).toLocaleString("en-PK", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    />
                  ) : null}
                  {item.body_text ? (
                    <Text style={{ marginTop: 8, lineHeight: 22, color: theme.ink }}>{item.body_text}</Text>
                  ) : null}
                  {item.content_type === "voice" && item.media_path ? (
                    <Pressable
                      style={[styles.secondaryButton, { marginTop: 10 }]}
                      onPress={() => void openAnnouncementMedia(item.media_path!)}
                    >
                      <Text style={styles.secondaryButtonText}>Play voice message</Text>
                    </Pressable>
                  ) : null}
                  {item.content_type === "video" && item.media_path ? (
                    <Pressable
                      style={[styles.secondaryButton, { marginTop: 10 }]}
                      onPress={() => void openAnnouncementMedia(item.media_path!)}
                    >
                      <Text style={styles.secondaryButtonText}>Watch video</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No announcements right now.</Text>
            )}
          </>
        )}

        {activeTab === "account" && (
          <View style={styles.docCard}>
            <Text style={styles.sectionTitle}>Change password</Text>
            <Text style={styles.muted}>Use at least 8 characters. This changes your mobile portal password.</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              secureTextEntry
            />
            <Pressable style={styles.primaryButton} disabled={changingPassword} onPress={changePassword}>
              <Text style={styles.primaryButtonText}>{changingPassword ? "Saving..." : "Change password"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value == null || value === "" ? "-" : String(value)}</Text>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.infoLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
      />
    </View>
  );
}

function SummaryCard({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <View style={styles.docCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {lines.map(([label, value]) => (
        <InfoRow key={label} label={label} value={value} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 18 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.green, padding: 24 },
  splashContent: { alignItems: "center", justifyContent: "center" },
  logoMark: {
    width: 108,
    height: 108,
    borderRadius: 34,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  logoText: { color: theme.green, fontSize: 36, fontWeight: "900" },
  splashTitle: { color: "white", fontSize: 32, fontWeight: "900", textAlign: "center" },
  splashSubtitle: { color: "#d1fae5", fontSize: 21, fontWeight: "800", marginTop: 6 },
  splashSmall: { color: "#e8f7ef", fontSize: 14, marginTop: 14, textTransform: "uppercase", letterSpacing: 2 },
  title: { fontSize: 26, fontWeight: "900", color: theme.ink },
  subtitle: { color: theme.green, fontWeight: "900", marginTop: 4 },
  muted: { color: theme.muted, marginTop: 4, lineHeight: 20 },
  link: { color: theme.green, fontWeight: "800" },
  forgotText: { color: theme.green, fontWeight: "900", textAlign: "center", marginTop: 6 },
  signOut: { color: "white", fontWeight: "900" },
  loginCard: {
    backgroundColor: theme.card,
    borderRadius: 28,
    padding: 24,
    gap: 12,
    marginTop: 52,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.greenDark,
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 6,
  },
  heroCard: {
    backgroundColor: theme.green,
    borderRadius: 30,
    padding: 20,
    marginBottom: 14,
    shadowColor: theme.greenDark,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  smallLogo: { width: 44, height: 44, borderRadius: 16, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  smallLogoText: { color: theme.green, fontWeight: "900", fontSize: 18 },
  heroKicker: { color: theme.mint, fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2 },
  heroTitle: { color: "white", fontSize: 25, fontWeight: "900", marginTop: 5 },
  heroSubtitle: { color: "#e8f7ef", fontWeight: "700", marginTop: 4 },
  inputGroup: { marginTop: 10 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 13, marginTop: 8 },
  multilineInput: { minHeight: 82, textAlignVertical: "top" },
  primaryButton: { backgroundColor: theme.green, borderRadius: 16, padding: 15, alignItems: "center", marginTop: 10 },
  primaryButtonText: { color: "white", fontWeight: "800" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tab: { borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: "white" },
  activeTab: { backgroundColor: theme.green, borderColor: theme.green },
  tabText: { color: theme.muted, fontWeight: "900", fontSize: 12 },
  activeTabText: { color: "white" },
  list: { gap: 12, paddingBottom: 32 },
  docCard: {
    backgroundColor: theme.card,
    borderRadius: 24,
    padding: 17,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.greenDark,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  docHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  docTitle: { fontSize: 16, fontWeight: "900", color: theme.ink, flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: theme.ink, marginBottom: 4 },
  sectionHint: { color: theme.muted, fontSize: 12, marginBottom: 10 },
  status: { color: theme.muted, fontWeight: "800" },
  statusPill: { color: theme.green, backgroundColor: theme.greenSoft, borderRadius: 999, overflow: "hidden", paddingVertical: 5, paddingHorizontal: 10, fontWeight: "900", fontSize: 12, textTransform: "capitalize" },
  statusApproved: { color: theme.green },
  statusRejected: { color: theme.red },
  rejection: { color: theme.red, marginTop: 9, fontSize: 13, backgroundColor: "#fee2e2", padding: 10, borderRadius: 12 },
  readOnlyNote: { color: "#7c2d12", backgroundColor: "#fef3c7", borderRadius: 14, padding: 11, marginTop: 10, marginBottom: 10, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: "#ecfdf3", paddingVertical: 9 },
  infoLabel: { color: theme.muted, fontSize: 12, fontWeight: "800", flex: 1 },
  infoValue: { color: theme.ink, fontSize: 13, fontWeight: "900", flex: 1.2, textAlign: "right" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  secondaryButton: { borderWidth: 1, borderColor: theme.green, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: theme.greenSoft },
  secondaryButtonText: { color: theme.greenDark, fontWeight: "900" },
  disabledButton: { opacity: 0.4 },
});
