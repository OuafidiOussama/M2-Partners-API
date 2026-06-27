Place your .docx template files here:

- work_certificate.docx   → Used for WORK_CERTIFICATE document type
- salary_certificate.docx → Used for SALARY_CERTIFICATE document type

Template variables supported:
  {{full_name}}       - Employee's full name
  {{cin}}             - Employee's CIN number
  {{start_date}}      - Employment start date (formatted DD/MM/YYYY)
  {{net_salary}}      - Net salary
  {{gross_salary}}    - Gross salary
  {{generated_date}}  - Date the document was generated

If no template file is found, the system generates a plain .docx automatically.
