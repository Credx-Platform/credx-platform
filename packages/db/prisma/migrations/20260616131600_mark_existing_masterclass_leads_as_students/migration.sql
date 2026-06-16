UPDATE "Client" AS c
SET "status" = 'STUDENT'
FROM "ClientProgress" AS p
WHERE p."clientId" = c."id"
  AND c."status" = 'LEAD'
  AND (
    p."education"->>'masterclassEnrolled' = 'true'
    OR p."onboarding"->>'initialOfferInterest' = 'masterclass'
    OR p."onboarding"->>'lastOfferInterest' = 'masterclass'
    OR p."onboarding"->>'status' = 'masterclass'
    OR p."onboarding"->>'track' = 'masterclass'
    OR p."onboarding"->'signupIntake'->>'planPath' = 'masterclass'
    OR p."onboarding"->'lastSignupIntake'->>'planPath' = 'masterclass'
  );
