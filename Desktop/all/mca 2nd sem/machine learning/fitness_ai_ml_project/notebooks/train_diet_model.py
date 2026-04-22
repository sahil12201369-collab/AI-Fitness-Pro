import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
import joblib

# Load dataset
df = pd.read_csv('dataset/fitness_dataset.csv')

# Encode categorical columns
le = LabelEncoder()

categorical_cols = [
    'Gender', 'Fitness_Goal', 'Fitness_Level',
    'Injury_Status', 'Dietary_Preference'
]

for col in categorical_cols:
    df[col] = le.fit_transform(df[col])

# Encode target
df['Recommended_Diet'] = le.fit_transform(df['Recommended_Diet'])

# Features and Target
X = df.drop(['Recommended_Workout', 'Recommended_Diet', 'Goal_Timeline_Weeks'], axis=1)
y = df['Recommended_Diet']

# Train-Test Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Train Model
model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)

# Prediction
y_pred = model.predict(X_test)

# Accuracy
accuracy = accuracy_score(y_test, y_pred)
print("Diet Model Accuracy:", accuracy)

# Save Model
joblib.dump(model, 'models/diet_model.pkl')

print("Diet model trained and saved!")