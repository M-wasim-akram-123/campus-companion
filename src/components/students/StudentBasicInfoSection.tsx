import {
  DetailSection,
  Field,
  FieldGrid,
  SubsectionTitle,
} from "@/components/detail/detail-layout";

type Props = {
  fullName: string;
  rollNumber: string | null;
  fatherName: string | null;
  cnic: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  matricSchool: string | null;
  matricMarks: string | number | null;
  programName: string | null | undefined;
  className: string | null | undefined;
  academicStandingLabel: string;
  academicStandingDetail?: string;
  academicStandingIsPast: boolean;
  sectionLabel: string | null;
  sessionLabel: string | null | undefined;
  admissionDate: string | null;
  enrollmentTypeLabel?: string | null;
};

export function StudentBasicInfoSection({
  fullName,
  rollNumber,
  fatherName,
  cnic,
  dateOfBirth,
  gender,
  phone,
  email,
  address,
  guardianName,
  guardianPhone,
  matricSchool,
  matricMarks,
  programName,
  className,
  academicStandingLabel,
  academicStandingDetail,
  academicStandingIsPast,
  sectionLabel,
  sessionLabel,
  admissionDate,
  enrollmentTypeLabel,
}: Props) {
  const standingDisplay = academicStandingIsPast
    ? academicStandingLabel
    : `${academicStandingLabel}${academicStandingDetail ? ` (${academicStandingDetail})` : ""}`;

  return (
    <DetailSection
      title="Basic information"
      description="Personal, academic, and contact details recorded at admission."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <SubsectionTitle>Identity & contact</SubsectionTitle>
          <FieldGrid cols={2}>
            <Field label="Student name" value={fullName} />
            <Field label="Admission no." value={rollNumber} />
            <Field label="Father's name" value={fatherName} />
            <Field label="CNIC / B-Form" value={cnic} />
            <Field label="Date of birth" value={dateOfBirth} />
            <Field label="Gender" value={gender} />
            <Field label="Phone" value={phone} />
            <Field label="Email" value={email} />
            <Field label="Address" value={address} />
          </FieldGrid>
        </div>

        <div>
          <SubsectionTitle>Academic placement</SubsectionTitle>
          <FieldGrid cols={2}>
            <Field label="Program" value={programName} />
            <Field label="Admission class" value={className} />
            <Field label="Current standing" value={standingDisplay} />
            <Field label="Section" value={sectionLabel} />
            <Field label="Session" value={sessionLabel} />
            <Field label="Admission date" value={admissionDate} />
            <Field label="Enrollment type" value={enrollmentTypeLabel ?? "Regular student"} />
          </FieldGrid>
        </div>

        <div>
          <SubsectionTitle>Matriculation</SubsectionTitle>
          <FieldGrid cols={2}>
            <Field label="School" value={matricSchool} />
            <Field label="Marks" value={matricMarks} />
          </FieldGrid>
        </div>

        <div>
          <SubsectionTitle>Guardian</SubsectionTitle>
          <FieldGrid cols={2}>
            <Field label="Name" value={guardianName} />
            <Field label="Phone" value={guardianPhone} />
          </FieldGrid>
        </div>
      </div>
    </DetailSection>
  );
}
