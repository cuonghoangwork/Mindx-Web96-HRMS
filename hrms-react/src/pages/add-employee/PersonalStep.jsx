import { useTranslation } from "react-i18next";
import { Field } from './Field'
import { StepIcons } from './stepIcons'

export function PersonalStep({ form, errors, touched, fieldProps, handleChange, inputStyle }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--sp-6)", color: "var(--txt-primary)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        <span style={{ color: "var(--clr-primary-400)", display: "inline-flex" }}>{StepIcons.personal}</span>
        {t("employees.addEmployee.step1.heading", { defaultValue: "Personal Information" })}
      </h3>
      <div className="form-grid">
        <Field label={t("common.fieldLabels.fullName", { defaultValue: "Full Name" })} required error={errors.name} touched={touched.name} success={!errors.name && !!form.name}>
          <input {...fieldProps("name")} placeholder={t("employees.addEmployee.step1.fullNamePlaceholder", { defaultValue: "John Smith" })} />
        </Field>

        <Field label={t("common.fieldLabels.age", { defaultValue: "Age" })} required error={errors.age} touched={touched.age} success={!errors.age && !!form.age}>
          <input {...fieldProps("age")} type="number" placeholder={t("employees.addEmployee.step1.agePlaceholder", { defaultValue: "25" })} min="18" max="80" />
        </Field>

        <Field label={t("common.fieldLabels.gender", { defaultValue: "Gender" })} required error={errors.sex} touched={touched.sex} success={!errors.sex && !!form.sex}>
          <select {...fieldProps("sex")}>
            <option value="">{t("employees.addEmployee.step1.genderSelectPlaceholder", { defaultValue: "Select..." })}</option>
            <option value="Male">{t("common.gender.Male", { defaultValue: "Male" })}</option>
            <option value="Female">{t("common.gender.Female", { defaultValue: "Female" })}</option>
            <option value="Other">{t("common.gender.Other", { defaultValue: "Other" })}</option>
          </select>
        </Field>

        <Field label={t("employees.addEmployee.step1.phoneNumberLabel", { defaultValue: "Phone Number" })}>
          <input
            name="phone" value={form.phone} onChange={handleChange}
            style={inputStyle("phone")} type="tel" placeholder={t("employees.addEmployee.step1.phonePlaceholder", { defaultValue: "+1 555 123 4567" })}
          />
        </Field>

        <Field label={t("common.fieldLabels.email", { defaultValue: "Email" })} error={errors.email} touched={touched.email} success={!errors.email && !!form.email} hint={t("employees.addEmployee.step1.emailHint", { defaultValue: "Used for system login" })}>
          <input {...fieldProps("email")} type="email" placeholder={t("employees.addEmployee.step1.emailPlaceholder", { defaultValue: "john.smith@company.com" })} />
        </Field>

        <Field label={t("common.fieldLabels.address", { defaultValue: "Address" })}>
          <input
            name="address" value={form.address} onChange={handleChange}
            style={inputStyle("address")} placeholder={t("common.placeholders.streetCityStateZip", { defaultValue: "Street, City, State, ZIP" })}
          />
        </Field>
      </div>
    </div>
  );
}
