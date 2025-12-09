// Sample C++ file to test BakedIDE theme colors
#include <iostream>
#include <string>
#include <vector>

// Class definition with inheritance
class Animal
{
private:
    std::string name;
    int age;

public:
    // Constructor
    Animal(const std::string& n, int a) : name(n), age(a) {}
    
    // Virtual function
    virtual void makeSound() const
    {
        std::cout << "Some generic animal sound" << std::endl;
    }
    
    // Getter methods
    std::string getName() const { return name; }
    int getAge() const { return age; }
};

// Derived class
class Dog : public Animal
{
public:
    Dog(const std::string& n, int a) : Animal(n, a) {}
    
    // Override virtual function
    void makeSound() const override {
        std::cout << "Woof! Woof!" << std::endl;
    }
};

// Template function
template<typename T>
T addNumbers(T a, T b)
{
    return a + b;
}

// Main function
int main()
{
    // Variables and constants
    const int MAX_COUNT = 10;
    int counter = 0;
    double pi = 3.14159;
    bool isRunning = true;
    
    // String variable
    std::string message = "Hello from BakedIDE!";
    
    // Vector container
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    
    // Create objects
    Dog myDog("Buddy", 3);
    Animal* animalPtr = &myDog;
    
    // Control flow
    if (isRunning && counter < MAX_COUNT)
    {
        for (int i = 0; i < numbers.size(); ++i)
        {
            std::cout << "Number: " << numbers[i] << std::endl;
        }
        
        // Lambda function
        auto multiply = [](int x, int y) -> int
        {
            return x * y;
        };
        
        int result = multiply(5, 7);
        std::cout << "Result: " << result << std::endl;
    }
    
    // Function calls
    animalPtr->makeSound();
    std::cout << message << std::endl;
    
    // Template function usage
    int sum = addNumbers(10, 20);
    double sumDouble = addNumbers(3.14, 2.86);
    
    // Switch statement
    switch (counter)
    {
        case 0:
            std::cout << "Starting..." << std::endl;
            break;
        case 1:
            std::cout << "Running..." << std::endl;
            break;
        default:
            std::cout << "Unknown state" << std::endl;
    }
    
    return 0;
}
