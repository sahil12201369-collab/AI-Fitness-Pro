import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
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

# Features and Target
X = df.drop(['Recommended_Workout', 'Recommended_Diet', 'Goal_Timeline_Weeks'], axis=1)
y = df['Goal_Timeline_Weeks']

# Train-Test Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Train Model
model = RandomForestRegressor(n_estimators=100)
model.fit(X_train, y_train)

# Prediction
y_pred = model.predict(X_test)

# Evaluation
error = mean_absolute_error(y_test, y_pred)
print("Mean Absolute Error:", error)

# Save Model
joblib.dump(model, 'models/timeline_model.pkl')

print("Timeline model trained and saved!")